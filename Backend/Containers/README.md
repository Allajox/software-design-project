# Contenedores de SIVCR

Comandos para WSL. Todos se ejecutan desde esta carpeta:

```bash
cd /mnt/c/Users/ian/Documents/GitHub/software-design-project/Backend/Containers
```

## Levanta primera vez

```bash
docker compose up -d --build postgres
```

## Levantar

```bash
docker compose up -d postgres
```

## Parar

```bash
docker compose stop
```

## Parar y eliminar datos

```bash
docker compose down -v
```

## Eliminar todo

```bash
docker compose down -v --rmi all
```
