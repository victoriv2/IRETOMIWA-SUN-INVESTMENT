# ==============================================================================
# IRETOMIWA SUN INVESTMENT - LOCAL APPLICATION SERVER & FLUTTERWAVE CORS PROXY
# ==============================================================================

$Host.UI.RawUI.WindowTitle = "Iretomiwa Sun Investment - Local Server"

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "               IRETOMIWA SUN INVESTMENT - LOCAL SERVER" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Detect public IP address
Write-Host "[1/3] Detecting your PC's public IP address..." -ForegroundColor Gray
$publicIp = "Unable to determine"
$ipSources = @(
    "https://api.ipify.org",
    "https://checkip.amazonaws.com",
    "https://icanhazip.com"
)

foreach ($source in $ipSources) {
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Mozilla/5.0")
        $wc.Headers.Add("Accept", "text/plain")
        $resp = $wc.DownloadString($source).Trim()
        if ($resp -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
            $publicIp = $resp
            break
        }
    } catch {
        # Try next source
    }
}

Write-Host ""
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host " YOUR PC'S PUBLIC IP ADDRESS IS: $publicIp" -ForegroundColor Yellow -BackgroundColor DarkGreen
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "FLUTTERWAVE WHITELIST INSTRUCTION:" -ForegroundColor Cyan
Write-Host " 1. Open Flutterwave Dashboard: https://dashboard.flutterwave.com" -ForegroundColor White
Write-Host " 2. Navigate to: Settings -> Business Preferences -> Security" -ForegroundColor White
Write-Host " 3. Ensure 'IP Whitelist' toggle is ENABLED (Turned ON)" -ForegroundColor White
Write-Host " 4. In 'Whitelisted IP Addresses', add:" -ForegroundColor White
Write-Host "    $publicIp" -ForegroundColor Yellow
Write-Host " 5. Under Transfer Preferences, ensure 'API' or 'Both' is selected." -ForegroundColor White
Write-Host " 6. Click 'Save Changes'." -ForegroundColor White
Write-Host ""
Write-Host "NOTE: When using this local server, all payouts originate from your PC's IP" -ForegroundColor Gray
Write-Host "      ($publicIp), NOT from Netlify or cloud servers." -ForegroundColor Gray
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host ""

$port = 8080
$webRoot = $PSScriptRoot

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
    ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start listener on port $port : $_" -ForegroundColor Red
    Write-Host "Port $port might be in use by another program." -ForegroundColor Yellow
    Write-Host "Press Enter to exit..." -ForegroundColor Gray
    Read-Host
    exit 1
}

Write-Host "[2/3] Local Web Server started at: http://localhost:$port/" -ForegroundColor Green
Write-Host "[3/3] Opening Admin Portal in your default browser..." -ForegroundColor Green
Write-Host ""
Write-Host ">> Server is RUNNING. KEEP THIS BLACK WINDOW OPEN while using the app. <<" -ForegroundColor Yellow
Write-Host "   (Press Ctrl+C inside this window anytime to stop the server)" -ForegroundColor Gray
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# Launch default browser
try {
    Start-Process "http://localhost:$port/#admin"
} catch {
    Write-Host "Could not automatically launch browser. Please open: http://localhost:$port/#admin" -ForegroundColor Yellow
}

function Process-ClientRequest($context) {
    $request = $context.Request
    $response = $context.Response

    try {
        # Global CORS headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")
        $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")

        $rawPath = $request.Url.AbsolutePath
        $method  = $request.HttpMethod.ToUpper()

        # Handle CORS preflight
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            return
        }

        # Flutterwave Proxy Route: /api/flw/*
        if ($rawPath.StartsWith("/api/flw/", [System.StringComparison]::OrdinalIgnoreCase) -or $rawPath -eq "/api/flw") {
            $subPath = ""
            if ($rawPath.Length -gt 8) {
                $subPath = $rawPath.Substring(8).TrimStart('/')
            }
            $query = $request.Url.Query
            $targetUrl = "https://api.flutterwave.com/v3/$subPath$query"

            Write-Host "[FLW PROXY] $method $subPath" -ForegroundColor Magenta

            try {
                $authHeader = $request.Headers["Authorization"]

                $curlArgs = [System.Collections.Generic.List[string]]::new()
                $curlArgs.Add("-s")
                $curlArgs.Add("-w")
                $curlArgs.Add("---HTTPCODE---%{http_code}")
                $curlArgs.Add("-X")
                $curlArgs.Add($method)
                $curlArgs.Add("-H")
                $curlArgs.Add("Accept: application/json")

                if ($authHeader) {
                    $curlArgs.Add("-H")
                    $curlArgs.Add("Authorization: $authHeader")
                }

                $tempBodyFile = $null
                if ($method -eq "POST" -or $method -eq "PUT") {
                    $curlArgs.Add("-H")
                    $curlArgs.Add("Content-Type: application/json")

                    $tempBodyFile = [System.IO.Path]::GetTempFileName()
                    $fs = [System.IO.File]::Create($tempBodyFile)
                    $request.InputStream.CopyTo($fs)
                    $fs.Flush()
                    $fs.Close()

                    $curlArgs.Add("--data-binary")
                    $curlArgs.Add("@$tempBodyFile")
                }

                $curlArgs.Add($targetUrl)

                $rawOutput = & "curl.exe" $curlArgs

                if ($tempBodyFile -and [System.IO.File]::Exists($tempBodyFile)) {
                    try { Remove-Item $tempBodyFile -Force } catch {}
                }

                $parts = $rawOutput -split "---HTTPCODE---"
                $respBody = $parts[0]
                $statusCode = 200
                if ($parts.Length -gt 1) {
                    [int]::TryParse($parts[1].Trim(), [ref]$statusCode) | Out-Null
                }

                if ($statusCode -le 0 -or $statusCode -lt 100) {
                    $statusCode = 502
                    if ([string]::IsNullOrWhiteSpace($respBody)) {
                        $respBody = '{"status":"error","message":"Gateway timeout connecting to Flutterwave"}'
                    }
                }

                Write-Host "[FLW PROXY RES] $statusCode" -ForegroundColor $(if ($statusCode -ge 200 -and $statusCode -lt 300) { "Green" } else { "Yellow" })

                $response.StatusCode = $statusCode
                $response.ContentType = "application/json; charset=utf-8"
                $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respBody)
                $response.ContentLength64 = $respBytes.Length
                $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            } catch {
                Write-Host "[FLW PROXY ERR] $_" -ForegroundColor Red
                $response.StatusCode = 500
                $errMsg = $_.Exception.Message -replace '"', '\"'
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("{`"status`":`"error`",`"message`":`"$errMsg`"}")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }

            $response.Close()
            return
        }

        # Static File Serving
        $relPath = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = "index.html"
        }

        $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($webRoot, $relPath))
        if (-not $filePath.StartsWith($webRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            $response.Close()
            return
        }

        if (-not [System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            if ([string]::IsNullOrWhiteSpace($ext)) {
                $filePath = [System.IO.Path]::Combine($webRoot, "index.html")
            }
        }

        if ([System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $ctype = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $ctype = $mimeTypes[$ext]
            }
            $response.ContentType = $ctype
            $response.StatusCode = 200

            try {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentLength64 = $bytes.Length
                if ($method -ne "HEAD") {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } catch {
                $response.StatusCode = 500
            }
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }
    } catch {
        Write-Host "Error processing request for $rawPath : $_" -ForegroundColor DarkYellow
    } finally {
        try { $response.Close() } catch {}
    }
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        Process-ClientRequest -context $context
    }
} finally {
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
}
