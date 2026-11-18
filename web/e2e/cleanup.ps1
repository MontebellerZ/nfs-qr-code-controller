param([Parameter(Mandatory = $true)][string]$Prefix)
$ErrorActionPreference = 'Stop'
if ($Prefix -notmatch '^e2e-[a-f0-9-]{36}-$') {
    throw 'Prefixo de limpeza E2E invalido.'
}
$connectionString = $env:ConnectionStrings__DefaultConnection
if (-not $connectionString) {
    $secretsPath = Join-Path $env:APPDATA 'Microsoft\UserSecrets\nfs-qr-code-controller-local-api\secrets.json'
    $secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
    $connectionString = $secrets.'ConnectionStrings:DefaultConnection'
}
if (-not $connectionString) { throw 'Conexao SQL Server ausente para limpar os usuarios E2E.' }
$connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandText = "DELETE FROM AspNetUsers WHERE Email LIKE @prefix + '%@example.test'"
    $null = $command.Parameters.Add('@prefix', [System.Data.SqlDbType]::NVarChar, 100)
    $command.Parameters['@prefix'].Value = $Prefix
    $count = $command.ExecuteNonQuery()
    Write-Output "Limpeza E2E concluida: $count registros afetados, somente contas da execucao."
} finally {
    $connection.Dispose()
}
