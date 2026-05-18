# ModularESV — Sistema de Reservas de Bloques

App de reservas para espacios flexibles con paquetes Lite / Básico / Premium.

---

## 🚀 GUÍA DE DESPLIEGUE PASO A PASO

### PASO 1 — Crear cuenta en GitHub
1. Ve a https://github.com y crea una cuenta gratuita (si no tienes).
2. Crea un **nuevo repositorio** llamado `modularesv-booking` (público o privado).
3. Sube todos estos archivos al repositorio (puedes usar la opción "Upload files" de GitHub).

---

### PASO 2 — Crear base de datos en Supabase
1. Ve a https://supabase.com → **Start for free** → crea cuenta.
2. Crea un **New Project** → ponle nombre `modularesv` → elige región más cercana (US East).
3. Espera ~2 minutos a que se cree.
4. En el menú lateral ve a **SQL Editor** → New Query.
5. **Copia y pega TODO el contenido** del archivo `supabase-schema.sql` → Run.
6. Ve a **Project Settings → API**:
   - Copia el valor de **Project URL** → lo necesitas para el paso 3.
   - Copia el valor de **anon / public** key → también para el paso 3.

---

### PASO 3 — Publicar en Vercel
1. Ve a https://vercel.com → crea cuenta con tu GitHub.
2. Click en **Add New Project** → importa el repositorio `modularesv-booking`.
3. En la sección **Environment Variables** agrega estas 3 variables:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | La URL que copiaste de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La anon key de Supabase |
| `ADMIN_SECRET` | Una contraseña que tú elijas (ej. `modular2024!`) |

4. Click en **Deploy** → espera ~3 minutos.
5. Vercel te dará una URL tipo `modularesv-booking.vercel.app` — ¡ya está funcionando!

---

### PASO 4 — Conectar el subdominio flexbooking.modularesv.com
1. En Vercel, ve a tu proyecto → **Settings → Domains**.
2. Escribe `flexbooking.modularesv.com` → Add.
3. Vercel te mostrará un registro **CNAME** — cópialo (apunta a `cname.vercel-dns.com`).
4. En el panel de tu proveedor de dominio (GoDaddy, Namecheap, etc.) agrega ese registro CNAME:
   - **Tipo**: CNAME
   - **Nombre / Host**: `flexbooking`
   - **Valor**: `cname.vercel-dns.com`
5. En 5–30 minutos tu app estará en https://flexbooking.modularesv.com.

> Tu sitio web principal modularesv.com no se toca.

---

## 📱 URLS DE LA APP

| URL | Descripción |
|---|---|
| `flexbooking.modularesv.com` | Página de inicio de la app |
| `flexbooking.modularesv.com/portal` | **Portal para clientes** — hacen sus reservas |
| `flexbooking.modularesv.com/admin` | **Panel de administrador** — gestión completa |

---

## ⚙️ FUNCIONAMIENTO

### Paquetes
| Paquete | Bloques | Precio |
|---|---|---|
| Premium | 10 | $200+IVA |
| Básico  | 6  | $160+IVA |
| Lite    | 3  | $125+IVA |

### Bloques de horario
- ☀️ **Mañana**: 7:00am – 12:00pm (incluido en paquete)
- 🌤️ **Tarde**: 1:00pm – 5:00pm (incluido en paquete)
- 🌙 **Noche extra**: 6:00pm – 9:00pm (costo adicional por día)

### Reglas automáticas
- Un solo espacio: no pueden coincidir dos clientes el mismo día y turno.
- Los bloques son válidos 30 días desde la fecha de inicio de vigencia.
- No se puede reservar los domingos.
- El sistema valida el cupo de bloques en tiempo real.
- El bloque nocturno no descuenta del cupo del paquete — se registra aparte.

---

## 🔧 DESARROLLO LOCAL

```bash
npm install
cp .env.example .env.local
# Rellena .env.local con tus valores de Supabase
npm run dev
# Abre http://localhost:3000
```
