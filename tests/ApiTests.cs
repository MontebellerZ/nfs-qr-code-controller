using System.Net;
using System.Net.Http.Json;
using System.Text;
using Nfs.Api;

namespace Nfs.Api.Tests;

public sealed class ApiTests
{
    [Theory]
    [InlineData("Abc1234", HttpStatusCode.BadRequest)]
    [InlineData("Abc12345", HttpStatusCode.OK)]
    [InlineData("Abc123456", HttpStatusCode.OK)]
    public async Task RegistrationRequiresAtLeastEightCharacters(string password, HttpStatusCode expected)
    {
        using var factory = new ApiFactory();
        using var client = factory.NewClient();
        await client.Csrf();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email = "test@example.test", password });
        Assert.Equal(expected, response.StatusCode);
        if (expected == HttpStatusCode.BadRequest)
            Assert.Contains("8 a 128", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task LoginRequiresCredentialsAndCsrfAndLogoutRemovesAccess()
    {
        using var factory = new ApiFactory();
        using var client = factory.NewClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/invoices")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register",
            new { email = "test@example.test", password = ClientExtensions.Password })).StatusCode);
        var email = await client.Register();
        Assert.True((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode);
        await client.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/invoices")).StatusCode);
        await client.Csrf();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "WrongPassword123" })).StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = ClientExtensions.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.True((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode);
    }

    [Fact]
    public async Task InvoicesArePersistentUniquePerUserAndCompletionIsIsolatedAndIdempotent()
    {
        using var factory = new ApiFactory();
        using var alice = factory.NewClient();
        using var bob = factory.NewClient();
        var aliceEmail = await alice.Register();
        await bob.Register();
        var content = Encoding.UTF8.GetBytes(TestDocuments.Xml());
        var created = await alice.Upload(content, "nota.xml");
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var invoice = (await created.Content.ReadFromJsonAsync<InvoiceDto>())!;
        Assert.Equal(TestDocuments.Key(), invoice.AccessKey);
        Assert.Null(invoice.CompletedAt);
        Assert.Equal(invoice.Id, (await alice.GetFromJsonAsync<InvoiceDto>(
            created.Headers.Location!))!.Id);
        Assert.Equal(HttpStatusCode.NotFound,
            (await bob.GetAsync($"/api/invoices/{invoice.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await alice.Upload(content, "duplicada.xml")).StatusCode);
        Assert.Empty((await bob.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!);
        await bob.Csrf();
        Assert.Equal(HttpStatusCode.NotFound,
            (await bob.PostAsync($"/api/invoices/{invoice.Id}/complete", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await bob.Upload(content, "mesma-nota.xml")).StatusCode);
        await alice.Csrf();
        Assert.True((await alice.PostAsync($"/api/invoices/{invoice.Id}/complete", null)).IsSuccessStatusCode);
        var first = Assert.Single((await alice.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!);
        Assert.NotNull(first.CompletedAt);
        await alice.PostAsync($"/api/invoices/{invoice.Id}/complete", null);
        var second = Assert.Single((await alice.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!);
        Assert.Equal(first.CompletedAt, second.CompletedAt);
        Assert.Null(Assert.Single((await bob.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!).CompletedAt);
        await alice.PostAsync("/api/auth/logout", null);
        await alice.Csrf();
        (await alice.PostAsJsonAsync("/api/auth/login",
            new { email = aliceEmail, password = ClientExtensions.Password })).EnsureSuccessStatusCode();
        Assert.Equal(first.CompletedAt,
            Assert.Single((await alice.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!).CompletedAt);
    }

    [Fact]
    public async Task UploadAcceptsPdfAndRejectsInvalidFilesWithoutSavingThem()
    {
        using var factory = new ApiFactory();
        using var client = factory.NewClient();
        await client.Register();
        Assert.Equal(HttpStatusCode.Created,
            (await client.Upload(TestDocuments.Pdf(TestDocuments.Key()), "nota.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload(Encoding.UTF8.GetBytes("<NFSe/>"), "nfse.xml")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload(TestDocuments.Pdf("NFS-e " + new string('1', 50)), "nfse.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload([], "vazia.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload(Encoding.UTF8.GetBytes("nao e um PDF"), "danificada.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload(Encoding.UTF8.GetBytes(TestDocuments.Xml()), "nota.exe")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.Upload(new byte[InvoiceEndpoints.MaxFileBytes + 1], "grande.pdf")).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!);
        var atLimit = Encoding.UTF8.GetBytes(
            TestDocuments.Xml(TestDocuments.Key(number: "000000789")).PadRight(InvoiceEndpoints.MaxFileBytes));
        Assert.Equal(HttpStatusCode.Created, (await client.Upload(atLimit, "limite.xml")).StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<InvoiceDto[]>("/api/invoices"))!.Length);
    }
}
