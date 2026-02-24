### Prompt: Configure Persistent SSL with Nginx

**Role:** DevOps Engineer.

**Context:**
We have generated SSL certificates (`server.crt`, `server.key`) on the host machine in a `./certs` directory to ensure persistence and avoid browser security reset warnings on every rebuild.
**Goal:** Configure the Frontend Nginx container to mount and use these existing certificates.

**Task: Update Docker Configuration.**

**Phase 1: Update Docker Compose**

* **Target:** `docker-compose.yml` (Frontend Service).
* **Action:**
* **Ports:** Map `443:443` (HTTPS).
* **Volumes:** Add a volume mapping to inject the certificates:
`- ./certs:/etc/nginx/ssl:ro` (Read-only).



**Phase 2: Configure Nginx**

* **Target:** `nginx.conf` (Frontend).
* **Action:**
* Create a `server` block listening on `443 ssl`.
* Point existing `ssl_certificate` directives to:
* `/etc/nginx/ssl/server.crt`
* `/etc/nginx/ssl/server.key`


* Ensure the `server_name` is set (e.g., `localhost`).
* Maintain the root location `/` serving `/usr/share/nginx/html`.



**Phase 3: Cleanup Dockerfile**

* **Target:** `frontend/Dockerfile`.
* **Action:**
* **REMOVE** any lines that generate certificates (`RUN openssl...`).
* **KEEP** the `COPY nginx.conf` and `EXPOSE 80 443`.
* Since we are mounting the files via Compose, the Dockerfile doesn't need to create them.



**Execution:**
Apply these changes. Assume the `./certs` folder exists on the host (user has already created it).
