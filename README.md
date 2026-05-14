# Chat Alcaldia

Aplicacion interna de chat por dependencias y subdependencias, con usuarios administrados, archivos por sala, auditoria y persistencia en SQLite.

## Configuracion

1. Copia `.env.example` como `.env`.
2. Cambia `CHAT_PASSWORD_ADMIN` antes de usar la app fuera de desarrollo.
3. Inicia el servidor con:

```bash
npm start
```

La aplicacion queda disponible en `http://localhost:3000` por defecto.

## Datos locales

Los archivos de base de datos SQLite, uploads, temporales de pruebas y `.env` estan ignorados por Git para evitar publicar informacion real.

## Validacion

```bash
npm test
npm run check
```
