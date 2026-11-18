using System.Net.Mail;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;

namespace Nfs.Api;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth").AddEndpointFilter<CsrfFilter>();
        auth.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
            Results.Ok(new { token = antiforgery.GetAndStoreTokens(context).RequestToken }));

        auth.MapPost("/register", async (Credentials input, UserManager<IdentityUser> users,
            SignInManager<IdentityUser> signIn) =>
        {
            var email = input.Email?.Trim();
            if (!ValidEmail(email))
                return Error("Informe um e-mail valido.");
            if (input.Password is not { Length: >= 8 and <= 128 } password ||
                !password.Any(char.IsAsciiLetterUpper) ||
                !password.Any(char.IsAsciiLetterLower) || !password.Any(char.IsAsciiDigit))
                return Error("A senha deve ter de 8 a 128 caracteres, com maiuscula, minuscula e numero.");

            var user = new IdentityUser { UserName = email, Email = email };
            var result = await users.CreateAsync(user, password);
            if (!result.Succeeded)
            {
                var duplicate = result.Errors.Any(x =>
                    x.Code is "DuplicateEmail" or "DuplicateUserName");
                return Error(duplicate ? "Ja existe uma conta com este e-mail."
                    : "Nao foi possivel cadastrar. Verifique o e-mail e os requisitos da senha.",
                    duplicate ? 409 : 400);
            }
            await signIn.SignInAsync(user, isPersistent: false);
            return Results.Ok(new UserDto(user.Id, user.Email!));
        }).RequireRateLimiting("auth");

        auth.MapPost("/login", async (Credentials input, SignInManager<IdentityUser> signIn,
            UserManager<IdentityUser> users) =>
        {
            var email = input.Email?.Trim();
            if (!ValidEmail(email) || input.Password is not { Length: > 0 and <= 128 })
                return Error("E-mail ou senha incorretos.", 401);
            var result = await signIn.PasswordSignInAsync(email!, input.Password,
                isPersistent: false, lockoutOnFailure: true);
            if (!result.Succeeded)
                return Error(result.IsLockedOut
                    ? "Muitas tentativas. Tente novamente em 15 minutos."
                    : "E-mail ou senha incorretos.", 401);
            var user = await users.FindByEmailAsync(email!);
            return Results.Ok(new UserDto(user!.Id, user.Email!));
        }).RequireRateLimiting("auth");

        auth.MapGet("/me", async (HttpContext context, UserManager<IdentityUser> users) =>
        {
            var user = await users.GetUserAsync(context.User);
            return user is null ? Results.Unauthorized()
                : Results.Ok(new UserDto(user.Id, user.Email!));
        }).RequireAuthorization();

        auth.MapPost("/logout", async (SignInManager<IdentityUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization();
    }

    private static bool ValidEmail(string? email) => email is { Length: <= 254 } &&
        MailAddress.TryCreate(email, out var address) && address.Address == email;

    private static IResult Error(string detail, int statusCode = 400) =>
        Results.Problem(statusCode: statusCode, title: "Acesso a conta", detail: detail);

    public sealed record Credentials(string? Email, string? Password);
    public sealed record UserDto(string Id, string Email);
}

public sealed class CsrfFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        if (!HttpMethods.IsGet(context.HttpContext.Request.Method))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context.HttpContext);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.Problem(statusCode: 400, title: "Sessao invalida",
                    detail: "Atualize a pagina antes de tentar novamente.");
            }
        }
        return await next(context);
    }
}
