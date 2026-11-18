import argparse
import re
import sys
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError


NUMEROS = re.compile(
    r"(?<![0-9])(?:[0-9]{44}(?![0-9])|[0-9]{4}(?:\s+[0-9]{4}(?![0-9]))+)"
)


def chaves_no_texto(texto: str) -> set[str]:
    chaves: set[str] = set()
    for trecho in NUMEROS.finditer(texto):
        chave = "".join(trecho[0].split())
        if len(chave) != 44 or chave[20:22] not in {"55", "65"}:
            continue
        # Modulo 11: pesos de 2 a 9, da direita para a esquerda.
        soma = sum(int(n) * (2 + i % 8) for i, n in enumerate(reversed(chave[:-1])))
        resto = soma % 11
        if int(chave[-1]) == (0 if resto < 2 else 11 - resto):
            chaves.add(chave)
    return chaves


def extrair_chaves(pdf: Path) -> tuple[dict[str, list[int]], bool]:
    """Retorna as paginas de cada chave e se havia texto no PDF."""
    paginas_por_chave: dict[str, list[int]] = {}
    tem_texto = False
    with pdf.open("rb") as arquivo:
        for numero, pagina in enumerate(PdfReader(arquivo).pages, start=1):
            texto = pagina.extract_text()
            tem_texto = tem_texto or bool(texto.strip())
            for chave in sorted(chaves_no_texto(texto)):
                paginas_por_chave.setdefault(chave, []).append(numero)
    return paginas_por_chave, tem_texto


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extrai chaves de acesso de 44 digitos (NF-e/NFC-e)."
    )
    parser.add_argument("caminho", type=Path, help="Arquivo PDF ou pasta de PDFs.")
    caminho = parser.parse_args().caminho
    if caminho.is_dir():
        pdfs = sorted(
            item for item in caminho.iterdir()
            if item.is_file() and item.suffix.lower() == ".pdf"
        )
        if not pdfs:
            parser.error(f"nenhum PDF em {caminho}")
    elif caminho.is_file() and caminho.suffix.lower() == ".pdf":
        pdfs = [caminho]
    else:
        parser.error(f"arquivo PDF ou pasta inexistente ou invalido: {caminho}")

    houve_erro = False
    for pdf in pdfs:
        try:
            chaves, tem_texto = extrair_chaves(pdf)
        except (OSError, PyPdfError) as erro:
            print(f"{pdf.name}: erro ao ler o PDF: {erro}", file=sys.stderr)
            houve_erro = True
            continue

        if chaves:
            for chave, paginas in chaves.items():
                print(f"{pdf.name}: {chave} (paginas: {', '.join(map(str, paginas))})")
        elif tem_texto:
            print(f"{pdf.name}: nenhuma chave NF-e/NFC-e de 44 digitos encontrada")
        else:
            print(f"{pdf.name}: sem texto extraivel; pode precisar de OCR")

    return int(houve_erro)


if __name__ == "__main__":
    sys.exit(main())
