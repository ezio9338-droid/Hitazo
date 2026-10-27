# Hitazo

Juego musical para jugar en grupo con un solo móvil o tablet: suena una canción y, sin mirar, el jugador la coloca en su línea temporal (antes, entre o después de las que ya tiene). Si acierta, se queda la carta. Gana quien antes complete su colección.

**Jugar:** https://ezio9338-droid.github.io/hitazo/

## Cómo se juega

1. Escribe los nombres de los jugadores o equipos (de 2 a 8).
2. Elige cuántas cartas hacen falta para ganar, las listas de canciones y las décadas.
3. Cada jugador empieza con una carta ya descubierta.
4. En tu turno, pulsa **Escuchar**, toca el hueco de tu línea donde crees que va la canción y pulsa **Colocar aquí y ver el año**.
5. Si el año encaja, la carta se queda en tu línea. Si no, se descarta. Pasa el móvil al siguiente.

La partida se guarda en el navegador: si recargas la página, puedes continuarla.

## Añadir canciones

Las canciones están en `songs.json`. Cada una tiene:

```json
{"t": "Título", "a": "Artista", "y": 1986, "l": "es", "v": "ID_DE_YOUTUBE"}
```

- `y`: año de la primera publicación de la canción.
- `l`: lista, `es` (en español) o `int` (internacional).
- `v`: el código del vídeo de YouTube (lo que va detrás de `watch?v=`). El vídeo tiene que permitir su reproducción en otras webs.
- `s` (opcional): segundo en el que empieza a sonar, para saltarse intros largas.

Si un vídeo no se puede reproducir, el juego lo salta automáticamente y saca otra canción.

`tools/resolver.js` es el script que se usó para buscar los vídeos: se pega en la consola del navegador con youtube.com abierto.
