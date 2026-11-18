using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Nfs.Api;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<Invoice> Invoices => Set<Invoice>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Invoice>(entity =>
        {
            entity.Property(x => x.AccessKey).HasMaxLength(44).IsUnicode(false).IsRequired();
            entity.Property(x => x.FileName).HasMaxLength(255).IsRequired();
            entity.HasIndex(x => new { x.UserId, x.AccessKey }).IsUnique();
            entity.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

public sealed class Invoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string UserId { get; set; }
    public required string AccessKey { get; set; }
    public required string FileName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}

public sealed record InvoiceDto(Guid Id, string AccessKey, string FileName,
    DateTime CreatedAt, DateTime? CompletedAt)
{
    public static InvoiceDto From(Invoice invoice) => new(invoice.Id, invoice.AccessKey,
        invoice.FileName, DateTime.SpecifyKind(invoice.CreatedAt, DateTimeKind.Utc),
        invoice.CompletedAt is { } completed
            ? DateTime.SpecifyKind(completed, DateTimeKind.Utc) : null);
}
