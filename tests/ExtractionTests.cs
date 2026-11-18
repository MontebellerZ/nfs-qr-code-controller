using Nfs.Api;

namespace Nfs.Api.Tests;

public sealed class ExtractionTests
{
    private readonly InvoiceExtractor extractor = new();

    [Theory]
    [InlineData("55")]
    [InlineData("65")]
    public void ReadsCompactAndWrappedKeysWithoutTakingPartOfLongerNumbers(string model)
    {
        var key = TestDocuments.Key(model);
        var wrapped = string.Join("\n", key.Chunk(4).Select(chars => new string(chars)));
        Assert.Equal(key, Assert.Single(InvoiceExtractor.KeysInText($"Chave: {wrapped}")));
        Assert.Equal(key, Assert.Single(InvoiceExtractor.KeysInText($"12345\n{key}")));
        Assert.Empty(InvoiceExtractor.KeysInText(key + "123456"));
        Assert.Empty(InvoiceExtractor.KeysInText("9" + key));
        Assert.Empty(InvoiceExtractor.KeysInText(key[..43] + ((key[43] - '0' + 1) % 10)));
        Assert.Empty(InvoiceExtractor.KeysInText(wrapped + "\n1234"));
    }

    [Fact]
    public void ReadsPdfAcrossPagesAndRejectsAmbiguousOrUnsupportedPdf()
    {
        var key = TestDocuments.Key();
        var grouped = string.Join(" ", key.Chunk(4).Select(chars => new string(chars)));
        using var valid = new MemoryStream(TestDocuments.Pdf("DANFE", grouped, key));
        Assert.Equal(key, extractor.Extract(valid, ".pdf"));
        using var ambiguous = new MemoryStream(TestDocuments.Pdf(key, TestDocuments.Key(number: "000000456")));
        Assert.Contains("mais de uma", Assert.Throws<InvoiceValidationException>(
            () => extractor.Extract(ambiguous, ".pdf")).Message);
        using var blank = new MemoryStream(TestDocuments.Pdf(""));
        Assert.Contains("OCR", Assert.Throws<InvoiceValidationException>(
            () => extractor.Extract(blank, ".pdf")).Message);
        using var nfse = new MemoryStream(TestDocuments.Pdf("NFS-e " + new string('1', 50)));
        Assert.Contains("NFS-e", Assert.Throws<InvoiceValidationException>(
            () => extractor.Extract(nfse, ".pdf")).Message);
    }

    [Fact]
    public void AllowsOneHundredPdfPagesButRejectsMore()
    {
        var key = TestDocuments.Key();
        using var limit = new MemoryStream(TestDocuments.Pdf(Enumerable.Repeat(key, 100).ToArray()));
        Assert.Equal(key, extractor.Extract(limit, ".pdf"));
        using var over = new MemoryStream(TestDocuments.Pdf(Enumerable.Repeat(key, 101).ToArray()));
        Assert.Contains("100 paginas", Assert.Throws<InvoiceValidationException>(
            () => extractor.Extract(over, ".pdf")).Message);
    }

    [Fact]
    public void ReadsInvoiceXmlAndChecksProtocolWithoutConfusingReferencedKeys()
    {
        var key = TestDocuments.Key("65");
        var xml = $"""
            <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
              <NFe><infNFe Id="NFe{key}">
                <ide><NFref><refNFe>{TestDocuments.Key()}</refNFe></NFref></ide>
              </infNFe></NFe>
              <protNFe><infProt><chNFe>{key}</chNFe></infProt></protNFe>
            </nfeProc>
            """;
        using var valid = TestDocuments.Stream(xml);
        Assert.Equal(key, extractor.Extract(valid, ".xml"));
        using var mismatch = TestDocuments.Stream(xml.Replace($"<chNFe>{key}", $"<chNFe>{TestDocuments.Key()}"));
        Assert.Contains("divergentes", Assert.Throws<InvoiceValidationException>(
            () => extractor.Extract(mismatch, ".xml")).Message);
    }

    [Theory]
    [InlineData("<NFSe><chave>123456</chave></NFSe>")]
    [InlineData("<NFe>")]
    [InlineData("""<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><NFe>&xxe;</NFe>""")]
    [InlineData("""<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe123"/></NFe>""")]
    public void RejectsUnsupportedMalformedAndExternalEntityXml(string xml)
    {
        using var stream = TestDocuments.Stream(xml);
        Assert.Throws<InvoiceValidationException>(() => extractor.Extract(stream, ".xml"));
    }
}
