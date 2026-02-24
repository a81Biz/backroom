# Backroom Inventory & Order Management System

## Descripción Funcional

Este sistema es una herramienta integral diseñada para la gestión operativa, recepción de mercancías y control de inventario basada en Órdenes de Compra (Purchase Orders) y flujos ágiles de escaneo. 

### Características Principales:
*   **Catálogos y Órdenes Dinámicas (Excel):** Permite configurar "Mapeos" personalizados por proveedor para cargar catálogos completos u Órdenes de Compra directamente desde archivos `.xlsx` o `.csv`. El sistema lee dinámicamente el nombre, SKU, códigos de barras y cantidades solicitadas basándose en las columnas indicadas.
*   **Gestión Visual de Órdenes:** En la tabla de órdenes es posible identificar de dónde vino la solicitud, revisar su estatus de pago/tránsito y abrir un modal interactivo con el desglose exacto (Total de ítems, recibidos, pendientes, avance en porcentaje). Todo cuenta con prevención de duplicidad de carga.
*   **Recepción Ágil con Escáner:** Incorpora un escáner híbrido (dispositivos móviles/cámara o pistola decodificadora USB) para registrar las recepciones. El escáner detecta en tiempo real a qué Orden pertenece el ítem, lo descuenta de la lista de faltantes y actualiza el progreso. Además, incluye modalidad interconectada para artículos de diferentes proveedores, listando de cuál orden de compra se desea registrar.
*   **Gestión Ad-Hoc (Sobre la marcha):** Si llega un artículo sin código de barras registrado, e incluso sin orden de compra, el sistema es capaz de escanearlo y registrar su ingreso al inventario físico (Status: *Draft* / *Ad-hoc*) dinámicamente, asegurando que nada se quede sin documentar.

---

## Technical Stack & Architecture

Este proyecto está construido bajo una arquitectura cliente-servidor con una mentalidad ágil y escalable, empaquetada e inicializada bajo ecosistemas Dockerizados.

### Frontend
Está fundamentado fuertemente en velocidad y responsividad.
*   **Core:** React (`v18.x`) con TypeScript.
*   **Bundler/Tooling:** Vite, que reemplaza configuraciones anticuadas y aumenta significativamente la velocidad de compilación.
*   **Styling:** Tailwind CSS (`v4`), con un sistema de diseño customizado para modo oscuro nativo, gradientes y retroalimentación interactiva UI/UX.
*   **Scanner:** Integración con `html5-qrcode`.
*   **Despliegue Interno:** Genera los *assets* estáticos y son servidos por medio de un proxy reverso **Nginx**, habilitado para puertos HTTPS seguros (usando mkcert para credenciales de localhost).

### Backend
Enfocado en concurrencia masiva, resiliencia y seguridad en lectura/escritura veloz.
*   **Core / Lenguaje:** Go (Golang).
*   **Framework DBRouting:** Uso de `chi-router` para el manejo de los endpoints de la API (`/api/v1/`).
*   **Database ORM:** GORM conectado a PostgreSQL. Toda la estructura de datos se encuentra auto-migrada mediante Modelos (`Product`, `PurchaseOrder`, `POItem`, `Supplier`).
*   **Procesamiento:** Utiliza un script de parseo dinámico `excelize/v2` para recorrer y leer celdas pesadas de Excel velozmente.

### Infrastructure & Deployments
Se implementa una arquitectura basada en contenedores localmente.
*   **Docker Compose:** Centraliza y orquesta todos los servicios.
    *   `db`: Contenedor oficial de PostgreSQL (Versión 15/Alpine).
    *   `backend`: Go compilado multi-etapa usando imágenes Distroless o Alpine livianas.
    *   `frontend`: Nginx sirviendo la construcción final de Vite `dist/`.
    *   *(Ciertas extensiones futuras preveen el servicio de `worker` de Python para análisis estadístico).*

---

### Iniciar la Plataforma Localmente
1. Levantar el proyecto en segundo plano y forzando la reconstrucción de sus dependencias:
   ```bash
   docker compose up -d --build backend frontend
   ```
2. Acceder al Frontend desde el navegador en `https://localhost` o a los endpoints de la API desde `https://localhost/api/`.
