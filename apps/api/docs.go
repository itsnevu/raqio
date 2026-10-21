package main

import (
	_ "embed"
	"net/http"
)

//go:embed openapi.yaml
var openapiSpec []byte

// /openapi.yaml dan /docs (Swagger UI). Spesifikasi tidak berisi rahasia, jadi publik.
// Bisa dimatikan dengan DOCS=0.

const swaggerHTML = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Raqio API</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
<style>body{margin:0}.topbar{display:none}</style></head><body><div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:"/openapi.yaml",dom_id:"#ui",withCredentials:true,persistAuthorization:true,
 requestInterceptor:r=>{r.headers["Sec-Fetch-Site"]="same-origin";return r}})</script></body></html>`

func (a *App) openapi(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Write(openapiSpec)
}

func (a *App) swaggerUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(swaggerHTML))
}
