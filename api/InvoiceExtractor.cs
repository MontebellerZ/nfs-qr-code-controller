using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using UglyToad.PdfPig.Exceptions;

namespace Nfs.Api;

public sealed partial class InvoiceExtractor
{
    private static readonly XNamespace Nfe = "http://www.portalfiscal.inf.br/nfe";

    public string Extract(Stream stream, string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".pdf" => ExtractPdf(stream),
            ".xml" => ExtractXml(stream),
            _ => throw new InvoiceValidationException("Envie um arquivo PDF ou XML.")
        };
    }

    public static bool IsValidKey(string key)
    {
        if (key.Length != 44 || !key.All(char.IsAsciiDigit) ||
            key.Substring(20, 2) is not ("55" or "65"))
            return false;
        var sum = 0;
        for (var index = 42; index >= 0; index--)
            sum += (key[index] - '0') * (2 + (42 - index) % 8);
        var remainder = sum % 11;
        return key[43] - '0' == (remainder < 2 ? 0 : 11 - remainder);
    }

    public static IEnumerable<string> KeysInText(string text) => KeyPattern().Matches(text)
        .Select(match => string.Concat(match.Value.Where(char.IsAsciiDigit)))
        .Where(IsValidKey).Distinct();

    private static string ExtractPdf(Stream stream)
    {
        try
        {
            using var document = PdfDocument.Open(stream);
            if (document.NumberOfPages > 100)
                throw new InvoiceValidationException("O PDF deve ter no maximo 100 paginas.");
            var keys = new HashSet<string>();
            var hasText = false;
            var hasNfse = false;
            foreach (var page in document.GetPages())
            {
                var text = ContentOrderTextExtractor.GetText(page);
                hasText |= !string.IsNullOrWhiteSpace(text);
                hasNfse |= NfsePattern().IsMatch(text) ||
                    text.Contains("NFS-e", StringComparison.OrdinalIgnoreCase);
                keys.UnionWith(KeysInText(text));
            }
            if (!hasText)
                throw new InvoiceValidationException(
                    "PDF sem texto extraivel (possivelmente digitalizado). Envie o XML ou um PDF com texto. OCR nao esta disponivel.");
            if (keys.Count == 0 && hasNfse)
                throw new InvoiceValidationException(
                    "NFS-e nao e aceita. Envie uma NF-e/NFC-e com chave de acesso de 44 digitos.");
            return SingleKey(keys);
        }
        catch (PdfDocumentEncryptedException)
        {
            throw new InvoiceValidationException("PDF protegido por senha. Envie uma copia sem protecao.");
        }
        catch (PdfDocumentFormatException)
        {
            throw new InvoiceValidationException("O PDF esta danificado ou possui formato invalido.");
        }
    }

    private static string ExtractXml(Stream stream)
    {
        try
        {
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = InvoiceEndpoints.MaxFileBytes
            });
            var document = XDocument.Load(reader);
            if (document.Root?.Name != Nfe + "nfeProc" && document.Root?.Name != Nfe + "NFe")
                throw new InvoiceValidationException(
                    "XML nao e uma NF-e/NFC-e. NFS-e, eventos e outros formatos nao sao aceitos.");
            var invoices = document.Root.Name == Nfe + "NFe"
                ? new[] { document.Root }
                : document.Root.Elements(Nfe + "NFe").ToArray();
            if (invoices.Length != 1)
                throw new InvoiceValidationException("Envie o XML de uma unica NF-e/NFC-e.");
            var info = invoices[0].Element(Nfe + "infNFe");
            var id = info?.Attribute("Id")?.Value;
            if (id is null || !id.StartsWith("NFe", StringComparison.Ordinal) ||
                !IsValidKey(id[3..]))
                throw new InvoiceValidationException("XML sem chave de acesso NF-e/NFC-e valida.");
            var key = id[3..];
            var protocolKeys = document.Root.Elements(Nfe + "protNFe")
                .Elements(Nfe + "infProt").Elements(Nfe + "chNFe");
            if (protocolKeys.Any(element => element.Value.Trim() != key))
                throw new InvoiceValidationException("O XML contem chaves divergentes na nota e no protocolo.");
            return key;
        }
        catch (XmlException)
        {
            throw new InvoiceValidationException("XML invalido, danificado ou com declaracoes DTD nao permitidas.");
        }
    }

    private static string SingleKey(HashSet<string> keys) => keys.Count switch
    {
        1 => keys.Single(),
        0 => throw new InvoiceValidationException(
            "Nenhuma chave NF-e/NFC-e valida de 44 digitos encontrada. Verifique o arquivo ou envie o XML."),
        _ => throw new InvoiceValidationException(
            "O PDF contem mais de uma chave de acesso. Separe as notas em arquivos individuais ou envie o XML.")
    };

    // Aceita blocos separados, mas nunca recorta 44 digitos de uma chave maior.
    [GeneratedRegex(@"(?<![0-9])(?:[0-9]{44}(?![0-9])|[0-9]{4}(?:\s+[0-9]{4}(?![0-9]))+)",
        RegexOptions.None, 1000)]
    private static partial Regex KeyPattern();

    [GeneratedRegex(@"(?<![0-9])[0-9]{50}(?![0-9])", RegexOptions.None, 1000)]
    private static partial Regex NfsePattern();
}

public sealed class InvoiceValidationException(string message) : Exception(message);
