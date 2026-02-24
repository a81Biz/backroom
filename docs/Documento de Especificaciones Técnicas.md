# Documento de Especificaciones Técnicas (TSD): "The Backroom"

**Versión:** 1.0
**Estado:** Aprobado para Desarrollo
**Arquitectura:** Microservicios Contenedorizados

## 1. Arquitectura del Sistema

El sistema se basará en una arquitectura de microservicios orquestada por **Docker Compose**. Esto asegura que el entorno de desarrollo sea idéntico al de producción y permite escalar los módulos de manera independiente.

### Componentes Principales:

1. **Core API (Backend):** Servicio en **Go** que maneja la lógica de negocio, autenticación y base de datos.
2. **Worker Node (Procesamiento):** Servicio en **Python** dedicado exclusivamente a tareas pesadas (CPU intensive): procesamiento de imágenes y lectura de PDFs.
3. **Client (Frontend):** Aplicación SPA/PWA en **React** servida vía Nginx o servidor de desarrollo (Vite).
4. **Data Layer:** **PostgreSQL** para datos relacionales y **Sistema de Archivos (Volumen)** para blobs (imágenes/PDFs).

---

## 2. Stack Tecnológico

### 2.1 Backend (El Orquestador)

* **Lenguaje:** Go (Golang) versión 1.21+
* **Framework Web:** Standard Library `net/http` con router `Chi` (ligero y compatible con el estándar).
* **ORM:** `GORM` (para manejo de PostgreSQL y migraciones automáticas).
* **Autenticación:** JWT (JSON Web Tokens).
* **Cliente WooCommerce:** `go-woocommerce` (librería oficial o fork mantenido).

### 2.2 Worker (El Minero)

* **Lenguaje:** Python 3.9+ (Versión Slim).
* **Librerías Clave:**
* `PyMuPDF` (aka `fitz`): Para extracción de alta velocidad de imágenes y texto de PDFs.
* `OpenCV` (`opencv-python-headless`): Para detección de contornos y recorte inteligente de imágenes.
* `Pandas`: Para cruce de datos masivo con archivos Excel (.xlsx).
* `Watchdog`: Para monitorear la carpeta compartida y reaccionar a nuevos archivos.



### 2.3 Frontend (La Interfaz)

* **Framework:** React 18 (construido con **Vite**).
* **Lenguaje:** JavaScript (ES6+) / TypeScript (Opcional, recomendado para mantenibilidad).
* **UI Framework:** **Tailwind CSS** (Utility-first).
* **Iconografía:** Lucide React o Material Symbols.
* **Escaneo Móvil:** `html5-qrcode` (Librería robusta para leer códigos de barras desde el navegador).
* **Estado Global:** React Context API o Zustand.

### 2.4 Base de Datos & Almacenamiento

* **Motor DB:** PostgreSQL 15 (Imagen `alpine`).
* **Volúmenes Docker:**
* `pg_data`: Persistencia de datos SQL.
* `shared_data`: Volumen compartido entre Go y Python para el paso de archivos (PDFs crudos -> Imágenes procesadas).



---

## 3. Diseño de Base de Datos (Schema Preview)

El esquema relacional en PostgreSQL se estructurará en torno a estas tablas core:

### Tabla: `products`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | UUID | Identificador único local. |
| `sku` | VARCHAR | Clave de negocio (única). |
| `woo_id` | INT | ID en WooCommerce (NULL si es nuevo). |
| `stock_on_hand` | INT | Existencia física real. |
| `stock_reserved` | INT | Ventas web pendientes de procesar. |
| `image_path` | VARCHAR | Ruta local de la imagen recortada. |
| `status` | ENUM | `DRAFT`, `PUBLISHED`, `ARCHIVED`. |

### Tabla: `purchase_orders` (Cabecera)

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | SERIAL | Número de PO interno. |
| `supplier_name` | VARCHAR | Proveedor. |
| `status` | ENUM | `PENDING`, `IN_TRANSIT`, `RECEIVED`. |
| `created_at` | TIMESTAMP | Fecha de creación. |

### Tabla: `po_items` (Detalle)

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `po_id` | INT | FK a `purchase_orders`. |
| `sku` | VARCHAR | FK a `products`. |
| `qty_ordered` | INT | Cantidad pedida. |
| `qty_received` | INT | Cantidad escaneada/recibida. |

---

## 4. Definición de APIs e Interfaces

### 4.1 Comunicación Interna (Go <-> Python)

* **Patrón:** Asíncrono vía Sistema de Archivos (Shared Volume).
* **Flujo:**
1. Go recibe `POST /upload`. Guarda PDF en `/shared/raw`.
2. Python (`Watchdog`) detecta evento `FILE_CREATED`.
3. Python procesa y guarda resultados en `/shared/processed/images` y metadatos en `/shared/processed/data.json`.
4. Go detecta `data.json` o recibe un webhook local (opcional) y actualiza la DB.



### 4.2 Endpoints REST (Go -> Frontend)

* `POST /api/ingest/upload`: Subida del PDF y Excel.
* `GET /api/products`: Listado con paginación y filtros.
* `POST /api/products/sync`: Dispara la sincronización hacia WooCommerce.
* `GET /api/orders`: Listado de POs.
* `POST /api/scan/item`: Endpoint para el escáner móvil (Recibe SKU + PO_ID).

### 4.3 Integración Externa (Go -> WooCommerce)

* **Autenticación:** Consumer Key / Consumer Secret.
* **Endpoints usados:**
* `GET /wp-json/wc/v3/orders`: Para bajar ventas (Sync Down).
* `POST /wp-json/wc/v3/products/batch`: Para crear/actualizar productos masivamente (Sync Up).



---

## 5. Estrategia de Infraestructura (Docker)

El archivo `docker-compose.yml` será la única fuente de verdad para levantar el entorno.

**Volúmenes Definidos:**

```yaml
volumes:
  shared_data: # Montado en /app/data tanto en Go como en Python
  postgres_data: # Persistencia de DB

```

**Redes:**

* `backroom-network`: Red interna donde se ven los contenedores. Solo el puerto 3000 (React) y 8080 (API) se exponen al host. La DB y el Worker permanecen aislados.

---

## 6. Requisitos del Entorno de Desarrollo

Para trabajar en este proyecto, el desarrollador necesita:

1. **Docker Desktop** (con soporte para Linux containers).
2. **Git**.
3. (Opcional pero recomendado) **VS Code** con extensiones "Remote - Containers" o "Docker".
4. No se requiere instalar Go, Python o Node.js localmente, ya que todo corre dentro de los contenedores.

---