using System.Text;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace Nfs.Api.Tests;

internal static class TestDocuments
{
    public static string Key(string model = "55", string number = "000000123")
    {
        var prefix = $"35261112345678000195{model}001{number}112345678";
        var sum = prefix.Reverse().Select((digit, index) => (digit - '0') * (2 + index % 8)).Sum();
        var remainder = sum % 11;
        return prefix + (remainder < 2 ? 0 : 11 - remainder);
    }

    public static string Xml(string? key = null) =>
        $"""<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe{key ?? Key()}" versao="4.00"/></NFe>""";

    public static byte[] Pdf(params string[] pages)
    {
        using var builder = new PdfDocumentBuilder();
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        foreach (var text in pages)
        {
            var page = builder.AddPage(PageSize.A4);
            if (text.Length > 0)
                page.AddText(text, 10, new PdfPoint(30, 700), font);
        }
        return builder.Build();
    }

    public static MemoryStream Stream(string text) => new(Encoding.UTF8.GetBytes(text));
}
