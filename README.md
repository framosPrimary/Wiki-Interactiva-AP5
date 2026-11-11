# Wiki Interactiva de AP5

Wiki interna para navegar y consultar la documentación funcional de AP5. Consume el arnés `Architecture` como fuente versionada y no modifica sus archivos.

## Componentes

- Next.js 16 y TypeScript: interfaz, APIs y agente por SSE.
- PostgreSQL 17 con pgvector: versiones, documentos, fragmentos y búsqueda híbrida.
- Adaptadores HTTP para OpenAI, Gemini y APIs compatibles con OpenAI.
- Ingestión atómica por commit, assets versionados, idempotencia y rollback.

## Inicio local

1. Copiar `.env.example` a `.env` y cambiar `SYNC_WEBHOOK_SECRET`.
2. Para levantar la solución completa con base, migración e ingestión inicial: `docker compose up --build`.
3. Para desarrollo sin ejecutar la aplicación en Docker, iniciar PostgreSQL con `docker compose up -d db` e instalar y preparar:

```bash
npm install
npm run content:validate -- --source ../Architecture
npm run db:migrate
npm run ingest -- --source ../Architecture
npm run dev
```

Sin proveedor de IA, navegación y búsqueda funcionan; el chat muestra las fuentes relacionadas y avisa que falta configurar el modelo.

### Vista previa sin Docker

Para revisar la interfaz y el corpus directamente desde el workspace, configurar `LOCAL_FILESYSTEM_MODE=true` y ejecutar `npm run dev`. Este modo lee `Architecture` como solo lectura y ofrece navegación, documentos, imágenes y búsqueda textual. PostgreSQL/pgvector continúa siendo obligatorio para el despliegue y para probar la ingestión versionada y la búsqueda semántica.

## Proveedores

`AI_PROVIDER` y `EMBEDDING_PROVIDER` aceptan `none`, `openai`, `openai-compatible` o `gemini`. Chat y embeddings tienen modelo, clave y URL base independientes. Las claves son variables del servidor y nunca se envían al navegador.

Para una API compatible con OpenAI, configurar `AI_BASE_URL` y/o `EMBEDDING_BASE_URL` apuntando al prefijo que exponga `/chat/completions` y `/embeddings`.

## Sincronización desde Git

El endpoint `POST /api/internal/content/sync` recibe:

```json
{ "commitSha": "commit-disponible-en-el-montaje" }
```

El cuerpo exacto se firma con HMAC SHA-256 usando `SYNC_WEBHOOK_SECRET`; enviar la firma como `x-ap5-signature: sha256=<hex>`. La fuente montada debe estar en ese commit. La ingestión valida el corpus, crea una versión provisional, genera embeddings y solo entonces cambia el puntero publicado. Repetir el commit devuelve la versión existente.

Como la aplicación vive dentro de la VPN, la integración recomendada es un runner interno: actualiza su checkout de `Architecture`, monta la carpeta como solo lectura y llama al endpoint. No se presupone que GitHub pueda ingresar directamente a la VPN.

El rollback usa el mismo esquema de firma sobre `POST /api/internal/content/rollback` con el commit previamente publicado.

## Fuente y política documental

- Páginas: los artefactos documentales `DOC-*` registrados bajo `Documentation/**/*.md`.
- Navegación: orden y nombres derivados de los `README.md` de módulos y submódulos, sin un menú duplicado en código.
- Complementos del agente: catálogo de pantallas seleccionadas, cobertura y conocimiento de soporte.
- Excluidos: Risk Manager fuera del MVP, Jotforms externos, `scratch`, `access`, `references`, legacy, sesiones y evidencia cruda.
- La documentación funcional tiene prioridad. Los complementos siempre incluyen estado y limitaciones.
- El MVP no persiste conversaciones. La tabla reservada para candidatos futuros no recibe escrituras desde el chat.

## Entrega a DevOps

`Dockerfile` produce una imagen standalone. `docker-compose.yml` sirve como referencia local; DevOps define registro, secretos, dominio, TLS, red, backups, observabilidad y ejecución del job de migración/ingestión.

El Compose local monta el repositorio `Architecture` como solo lectura, ejecuta la migración, valida e ingiere el corpus y recién entonces inicia la Wiki. En infraestructura, el runner interno puede reemplazar ese montaje por su checkout del arnés.

Endpoints operativos: `/api/health` y `/api/content/version`.

## Controles

```bash
npm run typecheck
npm test
npm run lint
npm run content:validate -- --source ../Architecture
npm run build
```
