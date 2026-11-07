#PostgreSQL con directorios para los tablespaces

FROM postgres:16-alpine

#PostgreSQL exige que el directorio de un tablespace exista, esté vacío y pertenezca
#al usuario del sistema que corre el servidor (postgres).
#Se crean aquí para que, al montar un volumen en /var/lib/postgresql/tablespaces,
#Docker copie la estructura y los permisos al volumen vacío.
RUN mkdir -p /var/lib/postgresql/tablespaces/data \
             /var/lib/postgresql/tablespaces/index \
             /var/lib/postgresql/tablespaces/admin \
    && chown -R postgres:postgres /var/lib/postgresql/tablespaces \
    && chmod -R 700 /var/lib/postgresql/tablespaces