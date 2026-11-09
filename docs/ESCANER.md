# Escáner Nexo: instalación y uso

## Conectar Android al PC

1. Conecta ambos equipos al **mismo Wi‑Fi**, o activa el hotspot del celular y conecta el PC a él. Tener internet en cada equipo no significa compartir red.
2. En Windows, entra a Nexo y pulsa **Conectar celular** en la barra lateral. Pulsa **Comprobar conector**.
3. Solo si falta o está desactualizado, descarga y ejecuta Conector Nexo. Es un `.exe` para **Windows x64**, no para Android. Puedes minimizarlo; debe seguir ejecutándose. Autoriza en el firewall únicamente la red privada que utilizas, sin desactivar el firewall ni abrir puertos del router.
4. Genera el QR en el PC. Con varias interfaces, elige la dirección de la red que comparte el celular.
5. En Android, lee el QR con la cámara. Se abrirá **Escáner Nexo**. Inicia sesión con la **misma cuenta y empresa** del PC. Puedes instalarlo desde Chrome → Instalar aplicación/Añadir a pantalla de inicio.
6. Pulsa **Conectar a este PC**, permite el acceso a la red local y acepta el celular en el PC. El QR es temporal y de un solo uso.
7. En el celular elige **Venta** o **Recibir compra** (solo administradores). Se abre el formulario en el PC y se resalta la operación activa cuando el PC la confirma.
8. Escanea: cada lectura añade una unidad al borrador. Retira el código del encuadre antes de repetirlo. Revisa precios, cantidades y confirma únicamente en el PC.

Cerrar un formulario conserva la vinculación y pausa el lector. Abrir otra operación recupera su borrador. Cambiar empresa o cuenta cierra el enlace. No borres datos del navegador si hay lecturas u operaciones pendientes.

## Sin internet

Con internet, instala y prepara previamente **ambos dispositivos**, iniciando sesión y habilitando el uso offline para la cuenta y empresa. La autorización dura hasta 24 horas desde su validación. Durante el corte deben seguir compartiendo Wi‑Fi o hotspot. El enlace local y el acceso a internet tienen estados independientes. Al volver internet sincroniza y revisa los conflictos.

## Si no conecta

- Redes diferentes: conéctalos a la misma red y genera un QR nuevo después de cambiar de red.
- QR caducado o consumido: genera otro en el PC.
- Permiso denegado: revisa los permisos del sitio Escáner Nexo en Chrome. Usa Chrome actualizado; no necesitas activar flags experimentales.
- Conector abierto pero inaccesible: comprueba firewall, perfil de red e interfaz elegida en el PC. Una red de invitados puede aislar dispositivos.
- Android no abre `.exe`: ese archivo se ejecuta en Windows. En Android instala la PWA desde Chrome.
- Cámara detenida: mantén el lector visible y concede permiso de cámara. También puedes escribir un SKU o código manualmente.
- Lectura pendiente: conserva los datos, vuelve al borrador original y restablece el enlace para reintentar con el mismo identificador.

## Etiquetas

Desde Productos → **Ver código y etiqueta**, o **Etiquetas y lector USB** en Windows, selecciona los productos. Descarga PNG/SVG o imprime en A4 al 100 %, sin ajustar: etiquetas de 50 × 30 mm. Recorta y pega la etiqueta, evitando pliegues y reflejos. Prueba una antes de imprimir un lote.

Si el producto ya trae código comercial, guárdalo como texto, incluidos los ceros iniciales. Si no, la etiqueta interna usa su SKU como Code 128. Descargar/imprimir no cambia identificadores ni existencias. Un código desconocido no crea productos ni stock automáticamente.

## Compilar el conector

Requiere Windows x64 y SDK .NET 10 para compilar, no para ejecutar el archivo final:

```powershell
$env:NEXO_DOTNET = (Get-Command dotnet).Source
npm run connector:build -- --production
npm run standalone:build
```

El script genera el `.exe` y sus partes descargables en directorios ignorados por Git. En tu propia instalación cambia primero los orígenes autorizados y el sitio que abre el conector; consulta [instalación](INSTALACION.md). La compilación sin `--production` abre validación.
