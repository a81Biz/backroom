package main

import (
	"backroom/internal/db"
	"backroom/internal/handlers"
	"backroom/internal/models"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// 1. Initialize DB
	db.Init()

	// Auto Migrate Supplier
	db.DB.AutoMigrate(&models.Supplier{})

	// 2. Setup Router
	r := chi.NewRouter()

	// 3. Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"}, // Adjust for production
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
	}))

	// 4. Routes
	r.Route("/api", func(r chi.Router) {
		r.Post("/ingest/upload", handlers.UploadHandler)
		r.Post("/ingest/trigger", handlers.TriggerProcessHandler)  // Moves to raw
		r.Post("/ingest/process", handlers.ProcessManifestHandler) // Returns JSON Preview
		r.Get("/ingest/files", handlers.GetSourceFilesHandler)
		r.Post("/ingest/clear", handlers.ClearProductsHandler)

		// Static Files for Manual Cropping (Full Pages)
		// Serve /media/processed/pages from /app/shared/processed/pages
		// The container WORKDIR is /app.
		// SHARED_DIR is /app/shared.
		// SHARED_DIR is /app/shared.
		// So we want to serve /app/shared/processed/pages at /media/pages

		// Serve /media/processed/* from /app/shared/processed/*
		// But we want /media/images/... and /media/pages/...
		// So we serve /media from /app/shared/processed
		FileServer(r, "/media", http.Dir("/app/shared/processed"))

		r.Get("/products", handlers.GetProductsHandler)
		r.Post("/products/sync", handlers.SyncProductHandler)

		// Product Actions
		r.Post("/products", handlers.CreateProductHandler) // Save from Preview
		r.Delete("/products/{id}", handlers.DeleteProductHandler)
		r.Put("/products/{id}", handlers.UpdateProductHandler)
		r.Put("/products/{id}/recrop", handlers.RecropHandler)

		r.Get("/orders", handlers.GetOrdersHandler)
		r.Post("/orders", handlers.CreateOrderHandler) // New endpoint for creating orders

		r.Post("/scan/item", handlers.ScanItemHandler)

		// Supplier Routes
		r.Get("/suppliers", handlers.GetSuppliersHandler)
		r.Get("/suppliers/{id}", handlers.GetSupplierHandler)
		r.Post("/suppliers", handlers.CreateSupplierHandler)
		r.Put("/suppliers/{id}", handlers.UpdateSupplierHandler)
		r.Post("/suppliers/preview-excel", handlers.PreviewExcelHandler)
		r.Post("/suppliers/{id}/catalog", handlers.CatalogUploadHandler)

		// Inventory & Orders
		r.Get("/inventory", handlers.GetInventoryHandler)
		r.Get("/orders", handlers.GetOrdersHandler)
		r.Post("/orders", handlers.CreateOrderHandler)

		// Sync Routes
		r.Get("/sync/status", handlers.GetSyncStatusHandler)
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	// 5. Start Server
	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}

// FileServer conveniently sets up a http.FileServer handler to serve
// static files from a http.FileSystem.
func FileServer(r chi.Router, path string, root http.FileSystem) {
	if strings.ContainsAny(path, "{}*") {
		panic("FileServer does not permit any URL parameters.")
	}

	if path != "/" && path[len(path)-1] != '/' {
		r.Get(path, http.RedirectHandler(path+"/", 301).ServeHTTP)
		path += "/"
	}
	path += "*"

	r.Get(path, func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))
		fs.ServeHTTP(w, r)
	})
}
