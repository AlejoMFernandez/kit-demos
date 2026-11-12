# Generador de demos V2: quién hace qué

Cada demo pasa por estos roles, en orden. Cada uno recibe un entregable, produce otro y tiene una condición
para pasar al siguiente. Los archivos de esta carpeta son las instrucciones de cada rol.

| # | Rol | Recibe | Entrega | Condición para pasar |
|---|---|---|---|---|
| 1 | Relevador (`relevador.md`) | Instagram del local | carpeta + `relevamiento.md` | tabla de datos obligatorios completa |
| 2 | Director de arte (`director-de-arte.md`) | carpeta relevada | moodboard V2 (hero y WOW en código real) | linter sin errores + **OK de Alejo** |
| 3 | Desarrollador (la skill) | moodboard aprobado | `web/` completa | linter sin errores en las 5 pantallas |
| 4 | Revisor (`revisor.md`) | URL + relevamiento + moodboard | informe con veredicto | "se entrega" |
| 5 | Publicación y pitch (la skill) | demo aprobada | URL de Vercel + ficha en la Central + registro actualizado | la ficha de `demos` en la intranet tiene horario de envío, canal y mensajes: sin eso la demo no está entregada |

- El revisor corre como agente aparte, sin el contexto del armado: es el único rol donde la independencia importa.
  Los demás los puede hacer la misma sesión, de a uno y en orden.
- Si el revisor devuelve la demo, después del arreglo se vuelve a correr la revisión entera.
- Herramientas: `tests/lint-visual.py` (errores que se ven), `scripts/ficha-diseno.py` (datos para el registro),
  `diseno/registro.json` + `diseno/catalogo.md` (qué ya se hizo y qué está vetado).
