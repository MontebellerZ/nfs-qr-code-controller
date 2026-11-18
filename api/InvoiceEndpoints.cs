using System.Security.Claims;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Nfs.Api;

public static class InvoiceEndpoints
{
    public const int MaxFileBytes = 10 * 1024 * 1024;

    public static void MapInvoiceEndpoints(this WebApplication app)
    {
        var invoices = app.MapGroup("/api/invoices").RequireAuthorization()
            .AddEndpointFilter<CsrfFilter>();
        invoices.MapGet("/", async (ClaimsPrincipal user, AppDbContext db, CancellationToken ct) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var items = await db.Invoices.AsNoTracking().Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
            return Results.Ok(items.Select(InvoiceDto.From));
        });
        invoices.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user,
            AppDbContext db, CancellationToken ct) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var invoice = await db.Invoices.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
            return invoice is null ? Results.NotFound() : Results.Ok(InvoiceDto.From(invoice));
        });
        invoices.MapPost("/", Upload).RequireRateLimiting("upload");
        invoices.MapPost("/{id:guid}/complete", async (Guid id, ClaimsPrincipal user,
            AppDbContext db, CancellationToken ct) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var query = db.Invoices.Where(x => x.Id == id && x.UserId == userId);
            // A confirmacao e idempotente, inclusive para requisicoes simultaneas.
            await query.Where(x => x.CompletedAt == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.CompletedAt, DateTime.UtcNow), ct);
            var invoice = await query.AsNoTracking().SingleOrDefaultAsync(ct);
            return invoice is null ? Results.NotFound()
                : Results.Ok(InvoiceDto.From(invoice));
        });
    }

    private static async Task<IResult> Upload(HttpRequest request, ClaimsPrincipal user,
        AppDbContext db, InvoiceExtractor extractor, CancellationToken ct)
    {
        if (!request.HasFormContentType)
            return Error("Envie um arquivo PDF ou XML como formulario multipart.");
        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(ct);
        }
        catch (InvalidDataException)
        {
            return Error("Formulario invalido ou muito grande. O limite e 10 MB por arquivo.");
        }
        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            return Error("Envie um unico arquivo no campo file.");
        if (file.Length == 0 || file.Length > MaxFileBytes)
            return Error("O arquivo deve ter entre 1 byte e 10 MB.");
        var fileName = Path.GetFileName(file.FileName.Replace('\\', '/'));
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Length > 255)
            return Error("Nome do arquivo invalido ou maior que 255 caracteres.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is not (".pdf" or ".xml"))
            return Error("Formato nao aceito. Envie somente PDF ou XML.");

        string key;
        try
        {
            // A copia e descartada apos a extracao; nenhum original e persistido.
            using var stream = new MemoryStream((int)file.Length);
            await file.CopyToAsync(stream, ct);
            stream.Position = 0;
            key = extractor.Extract(stream, extension);
        }
        catch (InvoiceValidationException exception)
        {
            return Error(exception.Message);
        }
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
        if (await db.Invoices.AnyAsync(x => x.UserId == userId && x.AccessKey == key, ct))
            return Duplicate();
        var invoice = new Invoice { UserId = userId, AccessKey = key, FileName = fileName };
        db.Invoices.Add(invoice);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return Duplicate();
        }
        return Results.Created($"/api/invoices/{invoice.Id}", InvoiceDto.From(invoice));
    }

    private static IResult Error(string detail) =>
        Results.Problem(statusCode: 400, title: "Arquivo nao aceito", detail: detail);

    private static IResult Duplicate() =>
        Results.Problem(statusCode: 409, title: "Nota ja cadastrada",
            detail: "Esta chave ja esta na sua conta, entre as pendentes ou concluidas.");
}
