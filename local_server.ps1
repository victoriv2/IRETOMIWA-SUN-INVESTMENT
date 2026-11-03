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
Write-Host " 3. Under 'Whitelisted IP Addresses', make sure this IP is added:" -ForegroundColor White
Write-Host "    $publicIp" -ForegroundColor Yellow
Write-Host " 4. Ensure Transfer Preferences is set to 'API' or 'Both'." -ForegroundColor White
Write-Host ""
Write-Host "NOTE: When using this local server, all payouts originate from your PC's IP" -ForegroundColor Gray
Write-Host "      ($publicIp), NOT from Netlify or cloud servers." -ForegroundColor Gray
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host ""

# 2. Configure HTTP Server
$port = 8080
$prefix = "http://localhost:$port/"
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
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Failed to start listener on $prefix : $_" -ForegroundColor Red
    Write-Host "Port $port might be in use by another program." -ForegroundColor Yellow
    Pause
    exit 1
}

Write-Host "[2/3] Local Web Server started at: $prefix" -ForegroundColor Green
Write-Host "[3/3] Opening Admin Portal in your default browser..." -ForegroundColor Green
Write-Host ""
Write-Host ">> Server is RUNNING. Press Ctrl+C in this window anytime to stop. <<" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# Launch browser
Start-Process "http://localhost:$port/#admin"

# Request loop
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        [System.Threading.ThreadPool]::QueueUserWorkItem({
            param($ctx)
            $request = $ctx.Request
            $response = $ctx.Response

            # Common CORS headers
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")

            $rawPath = $request.Url.AbsolutePath
            $method  = $request.HttpMethod.ToUpper()

            # Handle CORS preflight
            if ($method -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                return
            }

            # Handle Flutterwave Proxy: /api/flw/*
            if ($rawPath.StartsWith("/api/flw/", [System.StringComparison]::OrdinalIgnoreCase) -or $rawPath -eq "/api/flw") {
                $subPath = $rawPath.Substring(8).TrimStart('/')
                $query = $request.Url.Query
                $targetUrl = "https://api.flutterwave.com/v3/$subPath$query"

                try {
                    $webReq = [System.Net.HttpWebRequest]::Create($targetUrl)
                    $webReq.Method = $method
                    $webReq.Timeout = 45000
                    $webReq.UserAgent = "IretomiwaSunLocalProxy/1.0"

                    # Forward Authorization header
                    $authHeader = $request.Headers["Authorization"]
                    if ($authHeader) {
                        $webReq.Headers["Authorization"] = $authHeader
                    }

                    # Forward body for POST/PUT
                    if ($method -eq "POST" -or $method -eq "PUT") {
                        $webReq.ContentType = "application/json"
                        $reqStream = $request.InputStream
                        if ($reqStream) {
                            $targetStream = $webReq.GetRequestStream()
                            $reqStream.CopyTo($targetStream)
                            $targetStream.Flush()
                            $targetStream.Close()
                        }
                    }

                    $webResp = $null
                    try {
                        $webResp = $webReq.GetResponse()
                    } catch [System.Net.WebException] {
                        $webResp = $_.Exception.Response
                    }

                    if ($webResp) {
                        $httpWebResp = [System.Net.HttpWebResponse]$webResp
                        $response.StatusCode = [int]$httpWebResp.StatusCode
                        $response.ContentType = "application/json; charset=utf-8"

                        $respStream = $httpWebResp.GetResponseStream()
                        if ($respStream) {
                            $respStream.CopyTo($response.OutputStream)
                            $respStream.Close()
                        }
                        $httpWebResp.Close()
                    } else {
                        $response.StatusCode = 502
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"error","message":"No response received from Flutterwave"}')
                        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    }
                } catch {
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

            # Normalize path and check directory traversal
            $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($webRoot, $relPath))
            if (-not $filePath.StartsWith($webRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $response.Close()
                return
            }

            if (-not [System.IO.File]::Exists($filePath)) {
                # Fallback to index.html for SPA routes if file doesn't have an extension
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
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $response.StatusCode = 500
                }
            } else {
                $response.StatusCode = 404
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - Not Found")
                $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
            }

            $response.Close()
        }, $context)
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
