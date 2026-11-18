# Nota a nota

Sistema local para organizar notas fiscais e controlar quais já foram escaneadas
no aplicativo do celular. Frontend em React + TypeScript; API em ASP.NET Core 10;
SQL Server gerenciado por EF Core 10 e migrations.

## Funcionalidades

- Cadastro de conta, login e logout com ASP.NET Core Identity.
- Cada usuário vê e altera somente as próprias notas.
- Upload de vários PDFs/XMLs, processados individualmente, com resultado por arquivo.
- Extração de chave NF-e/NFC-e de 44 dígitos e validação do dígito verificador.
- Bloqueio de duplicatas por usuário, inclusive entre notas pendentes e concluídas.
- Busca por arquivo/chave, seleção individual ou em lote e fila de escaneamento.
- QR Code gerado no próprio navegador e botão para copiar a chave.
- Confirmação **manual** e persistente, com data, separando pendentes de concluídas.
- Guarda somente chave, nome do arquivo, usuário e datas. Não guarda o original.

O sistema é independente da Méliuz. Não consulta a SEFAZ, não comprova autenticidade,
autorização fiscal ou elegibilidade para cashback, nem envia notas para a Méliuz.
O QR Code contém **apenas os 44 dígitos**, não o link original do QR fiscal de uma
NFC-e. A compatibilidade com o leitor da Méliuz depende do aplicativo; use a chave
copiada na entrada manual quando disponível. Exibir/copiar a chave não conclui a nota.

## Executar localmente

Requisitos: .NET SDK 10, Node.js 22.12+ e SQL Server acessível. Os comandos abaixo
são PowerShell, executados na raiz deste projeto.

### 1. Configurar a conexão

A conexão fornecida foi configurada **somente no User Secrets local**, fora do
projeto. Para configurar outra máquina, cole a conexão quando solicitado:

```powershell
$connection = Read-Host 'String de conexao SQL Server' -MaskInput
dotnet user-secrets set 'ConnectionStrings:DefaultConnection' $connection --project .\api
Remove-Variable connection
```

`-MaskInput` requer PowerShell 7.1+. No Windows PowerShell 5.1, use:

```powershell
$secure = Read-Host 'String de conexao SQL Server' -AsSecureString
$connection = [System.Net.NetworkCredential]::new('', $secure).Password
dotnet user-secrets set 'ConnectionStrings:DefaultConnection' $connection --project .\api
Remove-Variable connection, secure
```

User Secrets é apropriado para desenvolvimento, mas **não é um cofre criptografado**.
Não coloque senha em código, arquivos versionados ou comandos compartilhados.
Em produção, injete `ConnectionStrings__DefaultConnection` usando o gerenciador
de segredos do ambiente.

### 2. Restaurar, compilar o front e iniciar

```powershell
dotnet restore .\NfsController.slnx
npm --prefix .\web ci
npm --prefix .\web run build
dotnet run --project .\api --launch-profile http
```

Acesse **http://localhost:5163** e crie sua conta na tela inicial.
A API serve também o React compilado. Compile o front **antes** de iniciar a API.
O build do React gera arquivos em `api/wwwroot`, que não devem ser editados.

No ambiente `Development`, a API aplica as migrations pendentes ao iniciar.
A migration inicial já foi aplicada ao banco local informado. São criadas as tabelas
do Identity, `Invoices` e `__EFMigrationsHistory`; nenhum banco é apagado ou recriado.
O usuário SQL precisa de permissão de alteração de schema para aplicar migrations.

### Desenvolvimento com atualização automática do React

Com a API em execução, abra outro terminal:

```powershell
npm --prefix .\web run dev
```

Acesse **http://localhost:5173**. O Vite encaminha `/api` para a API na porta 5163,
mantendo cookies e proteção CSRF na mesma origem. Escolha um endereço para usar
durante a sessão, em vez de alternar entre as duas portas.

## Banco e migrations

Para criar e aplicar mudanças de schema depois de alterar as entidades:

```powershell
dotnet tool restore
dotnet ef migrations add NomeDaAlteracao --project .\api
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet ef database update --project .\api
```

Nunca use `EnsureDeleted`/`EnsureCreated` no SQL Server da aplicação. Os testes
isolados usam `EnsureCreated` apenas em SQLite temporário, sem tocar o banco local.
Em produção, aplique migrations explicitamente com `dotnet ef database update`
ou execute a API com `--migrate` e a conexão injetada. O processo com esse argumento
aplica o schema e termina sem iniciar o servidor.

## Formatos e limites

- PDF: lê a camada de texto, independentemente da posição do campo. Aceita chave
  inteira ou em blocos de quatro separados por espaços/quebras de linha.
- XML: aceita `NFe` ou `nfeProc` no namespace oficial da NF-e. Usa `infNFe/@Id` e
  confere a chave do protocolo, sem confundir chaves de notas referenciadas.
- Modelos aceitos: **55 (NF-e)** e **65 (NFC-e)**.
- Rejeita NFS-e, XML de eventos, arquivos vazios/inválidos, chave inválida e arquivos
  que não sejam PDF/XML, apresentando o motivo no upload.
- Até **10 MB por arquivo** e **100 páginas por PDF**.
- PDF com múltiplas chaves distintas é rejeitado: envie as notas separadamente ou o XML.
- Não há OCR. Para PDF digitalizado/sem texto, use o XML ou um PDF com texto.
- Arquivos podem ser temporariamente bufferizados pelo ASP.NET durante a requisição;
  os originais não são armazenados permanentemente nem disponibilizados para download.

## Segurança e uso no celular

Senhas são gerenciadas pelo Identity com hash; sessões usam cookies HttpOnly,
proteção CSRF e SameSite. Login tem limite de tentativas e bloqueio temporário.
O banco impõe unicidade de chave por usuário. Não há recuperação de senha,
verificação de e-mail ou painel administrativo nesta primeira versão.

Para escanear o QR na tela do computador, basta usar a câmera do celular.
Para **abrir o sistema no celular**, disponibilize-o na rede com HTTPS e certificado
confiável, configurando o endereço de escuta/firewall conforme seu ambiente.
`localhost` no celular se refere ao próprio celular, não ao computador.

A cópia automática exige HTTPS (ou localhost) e permissão do navegador. Quando
indisponível, a tela seleciona a chave e orienta a copiar manualmente. Os perfis de
desenvolvimento são locais e não configuram acesso de rede automaticamente.

Para publicar, compile o front e então publique a API:

```powershell
npm --prefix .\web run build
dotnet publish .\api -c Release
```

Configure HTTPS, persistência das chaves de Data Protection para cookies,
backup do SQL Server e segredo de conexão fora do código. Não exponha o perfil HTTP
de desenvolvimento na internet.

## Testes

Testes .NET (extração, autenticação/CSRF, isolamento, duplicatas e confirmação):

```powershell
dotnet test .\NfsController.slnx
```

Testes Playwright, com o sistema real em execução em **http://localhost:5163**:

```powershell
Push-Location .\web
npx playwright install chromium
npm run test:e2e
Pop-Location
```

Os testes de navegador usam o SQL Server configurado, criam contas temporárias com
prefixo exclusivo e as apagam ao terminar, juntamente com suas notas. A limpeza
usa PowerShell/SqlClient no Windows e a mesma conexão do User Secrets (ou
`ConnectionStrings__DefaultConnection`). Não execute contra um banco de produção.

Há um teste opcional para os documentos privados locais, sem copiá-los para testes
nem expor suas chaves no relatório:

```powershell
$env:NFS_SAMPLE_DIRECTORY = (Resolve-Path .\NFs).Path
npm --prefix .\web run test:e2e
Remove-Item Env:\NFS_SAMPLE_DIRECTORY
```

Validação realizada: 12 testes .NET e 4 testes ponta a ponta aprovados. No acervo local,
149 arquivos foram aceitos (29 PDFs e 120 XMLs); 1 PDF NFS-e foi rejeitado. Os testes
também decodificam o QR Code gerado, verificam os 44 dígitos copiados e confirmam
persistência, isolamento e ausência de conclusão automática. Os registros de teste
são removidos ao final.

## Prova de conceito original

[extrair_chaves.py](./extrair_chaves.py) continua disponível como utilitário independente:

```powershell
python -m pip install -r .\requirements.txt
python .\extrair_chaves.py .\NFs
```

A aplicação web **não depende de Python**; a API extrai PDFs com PdfPig e XMLs com
o parser XML do .NET, com entidades externas/DTD desabilitadas.
