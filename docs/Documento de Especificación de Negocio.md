# Documento de Especificación de Negocio: "The Backroom"

**Versión:** 1.0
**Objetivo:** Sistema Middleware de Gestión de Inventario (PIM + WMS)

## 1. Visión General del Negocio

El objetivo es desacoplar la gestión operativa del inventario de la plataforma de ventas (WooCommerce). "The Backroom" funcionará como la **Fuente Única de Verdad (Single Source of Truth)** para el inventario, los catálogos y las órdenes de compra. WooCommerce pasará a ser únicamente un canal de venta (escaparate), subordinado a las reglas de stock de "The Backroom".

---

## 2. Glosario y Entidades

* **SKU:** Identificador único del producto.
* **PO (Purchase Order):** Orden de Compra a un proveedor. Contiene una lista de productos que *van a llegar*.
* **Stock Físico (On Hand):** Lo que realmente está en el almacén.
* **Stock en Tránsito (On Order):** Lo que se pidió al proveedor pero no ha llegado.
* **Stock Publicable:** (Stock Físico - Reservas/Ventas no procesadas).
* **Miner:** El proceso automatizado de extracción de datos de PDF.

---

## 3. Módulos y Reglas de Negocio

### Módulo A: Ingesta y Catalogación ("The Miner")

*Objetivo: Convertir catálogos PDF estáticos y listas de precios Excel en productos digitales listos para vender.*

**Flujo de Trabajo:**

1. **Entrada:** El usuario sube dos archivos:
* PDF del Catálogo (imágenes y descripciones visuales).
* Excel Maestro (SKU, Precios, Nombres oficiales).


2. **Procesamiento (Regla del "Miner"):**
* El sistema debe detectar imágenes de productos dentro del PDF.
* Debe recortar cada imagen individualmente.
* Debe intentar asociar (Match) la imagen con una fila del Excel basándose en texto cercano o metadatos.


3. **Estado "Borrador" (Staging):**
* Los productos procesados no van a la base de datos oficial todavía. Caen en una "Bandeja de Revisión".
* **Regla de Validación:** Un humano debe confirmar que la *Imagen A* corresponde al *Precio B*.
* **Excepción (Corrección Manual):** Si el recorte automático corta el producto, el usuario debe tener una herramienta visual para re-dibujar el área de recorte sobre el PDF original.


4. **Promoción:** Al confirmar, el producto se crea en la Base de Datos Local con `Stock: 0`.

### Módulo B: Gestión de Compras (WMS Ligero)

*Objetivo: Controlar qué se pide a los proveedores y cuándo llega.*

**Flujo de Trabajo:**

1. **Creación de PO:**
* El usuario crea una "Orden de Compra" seleccionando un proveedor y una fecha.
* Agrega productos (SKUs) y cantidades esperadas (ej. 50 cajas de Magic).
* **Estado Inicial:** `Pendiente`.


2. **Transición:**
* Al confirmar el pedido al proveedor, la PO pasa a estado `En Tránsito`.
* **Regla de Inventario:** El stock del producto *no cambia*. Solo aumenta el contador "En Tránsito".



### Módulo C: Recepción y Escaneo (Mobile App)

*Objetivo: Conciliar lo que llega físicamente contra lo que se pidió, usando el celular.*

**Flujo de Trabajo:**

1. **Recepción:** El operario selecciona una PO en estado `En Tránsito` desde su celular.
2. **Escaneo:**
* Usa la cámara para leer el código de barras/QR del producto físico.
* **Regla de Coincidencia:** Si el código escaneado existe en la PO, el sistema suma `+1 Recibido`.
* **Excepción (Input Manual):** Si el código está roto o no se lee, el usuario debe poder digitar el SKU o buscarlo por nombre manualmente.


3. **Cierre de PO:**
* Cuando se termina de revisar la caja, se da "Finalizar Recepción".
* **Actualización de Stock:** En este momento exacto, el `Stock Físico` en la base de datos local aumenta.
* **Alerta de Discrepancia:** Si se pidieron 10 y llegaron 8, la PO se cierra como `Parcial` y queda un registro de la falta.



### Módulo D: Sincronización (Sync Hub)

*Objetivo: Mantener WooCommerce alineado con la realidad del almacén.*

**Regla de Oro:** La sincronización nunca es automática en tiempo real para evitar conflictos. Es un proceso disparado por el usuario ("Batch Sync").

**Fase 1: Sync Down (Bajada de Ventas)**

* **Acción:** El sistema pregunta a WooCommerce: "¿Qué se vendió desde la última sincronización?".
* **Lógica:**
* WooCommerce responde: "Se vendieron 3 unidades del SKU-001".
* The Backroom ejecuta: `Stock Local = Stock Local - 3`.
* Esto asegura que no "re-publiquemos" stock que ya se vendió.



**Fase 2: Sync Up (Subida de Inventario)**

* **Acción:** El sistema envía la nueva realidad a WooCommerce.
* **Lógica:**
* **Productos Nuevos:** Si el SKU no existe en Woo, se crea (sube imagen recortada, título, precio). Se marca como `Borrador` o `Publicado` según configuración.
* **Productos Existentes:** Se actualiza únicamente el campo `Stock Quantity` y `Price` (si cambió en el Excel).
* **Productos Agotados:** Si `Stock Local == 0`, se actualiza Woo para reflejar "Agotado".



---

## 4. Diagrama de Estados del Producto

Para entender cómo vive un producto en tu sistema:

1. **Raw (Crudo):** Existe en el PDF pero no ha sido extraído.
2. **Draft (Borrador):** Recortado por el Miner, esperando validación humana.
3. **Catalogued (Catalogado):** Validado y guardado en la DB Local. `Stock: 0`.
4. **On Order (Pedido):** Incluido en una PO. `Stock: 0`, `Tránsito: N`.
5. **In Stock (En Existencia):** Recibido físicamente. `Stock: N`.
6. **Synced (Sincronizado):** La cantidad N ya se refleja en WooCommerce.

---

## 5. Requerimientos No Funcionales (Técnicos)

1. **Offline-Capable (Parcial):** El escáner móvil debe poder funcionar si la conexión Wi-Fi es intermitente dentro del almacén (siempre que la PO se haya cargado previamente).
2. **Performance de Imágenes:** El recorte de imágenes debe optimizarse para web (formato WebP o JPG comprimido) antes de subirse a WooCommerce, para no hacer lenta la tienda.
3. **Seguridad:** La API de "The Backroom" no debe estar expuesta al público, solo accesible desde la red local o mediante autenticación segura (JWT).

---