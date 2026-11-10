import { buildPushPayload } from "@block65/webcrypto-web-push";

export default {
async fetch(request, env) {
const url = new URL(request.url);

// Comprobar conexión con D1
if (url.pathname === "/api/test-db") {
if (request.method !== "GET") {
return Response.json(
{ success: false, error: "Método no permitido" },
{ status: 405 }
);
}

try {
const result = await env.DB.prepare(
"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
).all();

return Response.json({
success: true,
tables: result.results
});
} catch (error) {
return Response.json({
success: false,
error: "Error al consultar la base de datos"
}, { status: 500 });
}
}

// Registrar una suscripción
if (url.pathname === "/api/subscribe") {
if (request.method !== "POST") {
return Response.json(
{ success: false, error: "Método no permitido" },
{ status: 405 }
);
}

try {
const data = await request.json();

const endpoint = data.endpoint;
const p256dh = data.keys?.p256dh;
const auth = data.keys?.auth;

if (
typeof endpoint !== "string" ||
typeof p256dh !== "string" ||
typeof auth !== "string" ||
!endpoint.startsWith("https://") ||
!p256dh ||
!auth
) {
return Response.json(
{ success: false, error: "Datos no válidos" },
{ status: 400 }
);
}

await env.DB.prepare(`
INSERT INTO subscriptions (endpoint, p256dh, auth)
VALUES (?, ?, ?)
ON CONFLICT(endpoint) DO UPDATE SET
p256dh = excluded.p256dh,
auth = excluded.auth
`).bind(endpoint, p256dh, auth).run();

return Response.json({ success: true });

} catch (error) {
return Response.json({
success: false,
error: "No se pudo guardar la suscripción"
}, { status: 500 });
}
}

// Cancelar una suscripción
if (url.pathname === "/api/unsubscribe") {
if (request.method !== "POST") {
return Response.json(
{ success: false, error: "Método no permitido" },
{ status: 405 }
);
}

try {
const data = await request.json();
const endpoint = data.endpoint;

if (
typeof endpoint !== "string" ||
!endpoint.startsWith("https://")
) {
return Response.json(
{ success: false, error: "Endpoint no válido" },
{ status: 400 }
);
}

await env.DB.prepare(
"DELETE FROM subscriptions WHERE endpoint = ?"
).bind(endpoint).run();

return Response.json({ success: true });

} catch (error) {
return Response.json({
success: false,
error: "No se pudo eliminar la suscripción"
}, { status: 500 });
}
}

// Enviar una notificación de prueba protegida
if (url.pathname === "/api/test-push") {
if (request.method !== "POST") {
return Response.json(
{ success: false, error: "Método no permitido" },
{ status: 405 }
);
}

if (!env.PUSH_TEST_TOKEN) {
return Response.json(
{ success: false, error: "Token no configurado" },
{ status: 503 }
);
}

if (
request.headers.get("Authorization") !==
`Bearer ${env.PUSH_TEST_TOKEN}`
) {
return Response.json(
{ success: false, error: "No autorizado" },
{ status: 401 }
);
}

if (
!env.VAPID_PUBLIC_KEY ||
!env.VAPID_PRIVATE_KEY ||
!env.VAPID_SUBJECT
) {
return Response.json(
{ success: false, error: "Configuración VAPID incompleta" },
{ status: 503 }
);
}

try {
const result = await env.DB.prepare(
"SELECT endpoint, p256dh, auth FROM subscriptions"
).all();

const subscriptions = result.results || [];

if (subscriptions.length === 0) {
return Response.json({
success: false,
error: "No hay suscripciones registradas"
}, { status: 404 });
}

const vapid = {
subject: env.VAPID_SUBJECT,
publicKey: env.VAPID_PUBLIC_KEY,
privateKey: env.VAPID_PRIVATE_KEY
};

let sent = 0;
let failed = 0;
let removed = 0;

for (const item of subscriptions) {
const subscription = {
endpoint: item.endpoint,
expirationTime: null,
keys: {
p256dh: item.p256dh,
auth: item.auth
}
};

try {
const payload = await buildPushPayload(
{
data: {
title: "Último Minuto",
body: "¡Las notificaciones funcionan! Ya puedes recibir avisos deportivos.",
url: "/"
},
options: {
ttl: 60,
urgency: "high",
topic: "um-test"
}
},
subscription,
vapid
);

const response = await fetch(
subscription.endpoint,
payload
);

if (response.ok) {
sent++;
} else {
failed++;

if (
response.status === 404 ||
response.status === 410
) {
await env.DB.prepare(
"DELETE FROM subscriptions WHERE endpoint = ?"
).bind(subscription.endpoint).run();

removed++;
}
}

} catch (error) {
console.error("Error enviando push:", error);
failed++;
}
}

return Response.json({
success: sent > 0,
sent,
failed,
removed
});

} catch (error) {
console.error("Error general de push:", error);

return Response.json({
success: false,
error: "No se pudo completar el envío"
}, { status: 500 });
}
}

// Servir la aplicación
return env.ASSETS.fetch(request);
}
};
