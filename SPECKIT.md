# Spec Kit en Nexo

GitHub Spec Kit 1.3.1 está inicializado en este repositorio con la integración
`codex`, scripts PowerShell y el flujo SDD incluido. No se instalaron extensiones
de terceros ni se modificó la aplicación publicada.

## Uso en Codex

Abre esta carpeta `outputs/inventario` como proyecto para que Codex descubra las
habilidades de `.agents/skills`. Si la sesión ya estaba abierta, inicia una sesión
nueva en el proyecto para actualizar el descubrimiento.

Puedes pedir los pasos en lenguaje normal o invocar:

1. `$speckit-constitution`: actualizar las reglas del proyecto.
2. `$speckit-specify`: describir una mejora con escenarios verificables.
3. `$speckit-clarify`: resolver dudas relevantes, si existen.
4. `$speckit-plan`: diseñar la implementación sobre el código existente.
5. `$speckit-tasks`: dividir el plan en tareas.
6. `$speckit-analyze`: comprobar coherencia antes de implementar.
7. `$speckit-implement`: realizar las tareas.
8. `$speckit-converge`: comprobar brechas y completar lo pendiente.

Estos son comandos del chat del agente, no órdenes de PowerShell. El CLI
`specify` administra la instalación; no genera por sí solo las especificaciones.

## Primera aplicación del método

- Reglas: `.specify/memory/constitution.md`, versión 1.0.0.
- Propuesta: `specs/001-estado-guardado/spec.md`.
- Revisión de requisitos: `specs/001-estado-guardado/checklists/requirements.md`.
- Siguiente paso: `$speckit-plan` para esa propuesta.

La propuesta define estados claros de consulta y guardado, recuperación ante
fallos y protección frente a duplicados. Su revisión documental está completa.
La implementación y sus pruebas todavía están pendientes; no se presentan como
funcionalidad ya publicada.

## Instalación local comprobada

El ejecutable está en el entorno aislado de este espacio de trabajo:

```powershell
& 'C:\Users\TU_USUARIO\Documents\Codex\2026-11-05\desbloquea-las-tareas-en-linear-que\work\spec-kit-env\Scripts\specify.exe' version
```

No se agregó un comando global al PATH. El entorno está fuera del repositorio
de la aplicación. `version` confirmó 1.3.1 e `integration status` confirmó:
Codex activo, ningún archivo administrado modificado o faltante.

Fuente instalada: https://github.com/github/spec-kit.git, etiqueta `v1.3.1`,
commit `841921d5e46f27d7653ec6696743fbeb34f6fbde`.

Para reproducir en otro equipo, instala Python 3.11+ y usa la instalación oficial
con una versión fija:

```powershell
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.3.1
```

El repositorio ya está inicializado: no repitas `init --force` sobre archivos
personalizados. Conserva las habilidades generadas y personaliza mediante los
mecanismos de plantillas del proyecto.

## Referencias oficiales

- https://github.com/github/spec-kit/releases/tag/v1.3.1
- https://github.github.com/spec-kit/how-to/existing-projects.html
- https://github.github.com/spec-kit/integrations/codex.html
