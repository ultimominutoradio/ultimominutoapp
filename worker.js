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
error: error.message
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
{ success: false, error: "Datos de suscripción no válidos" },
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

return Response.json({
success: true,
message: "Suscripción guardada correctamente"
});

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

return Response.json({
success: true,
message: "Suscripción eliminada correctamente"
});

} catch (error) {
return Response.json({
success: false,
error: "No se pudo eliminar la suscripción"
}, { status: 500 });
}
}

// Servir la aplicación
return env.ASSETS.fetch(request);
}
};
