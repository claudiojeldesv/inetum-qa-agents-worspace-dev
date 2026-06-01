# ParaBank S2 DOM Mapping — Flujos Autenticados

## Application Overview

Mapeo DOM real de https://parabank.parasoft.com/parabank/index.htm para cuatro flujos declarados en el .feature de S2. Credenciales sintéticas: usuario `john`, contraseña `demo`. Señal de login exitoso: enlace "Log Out" presente en sidebar. Metodología: navegación real contra DOM vivo, sin inferencias. Flujo `close-account` confirmado como NO MAPEADO — no existe ninguna pantalla ni enlace de cierre de cuenta en la aplicación.

## Test Scenarios

### 1. login

**Seed:** ``

#### 1.1. Cliente introduce usuario y contraseña y accede; ve el resumen de cuentas

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Navegar a https://parabank.parasoft.com/parabank/index.htm
    - expect: La página carga con título 'ParaBank | Welcome | Online Banking'
    - expect: Aparece el formulario 'Customer Login' (heading level 2)
    - expect: Están presentes: textbox Username (input[name='username']), textbox Password (input[name='password']), button 'Log In' (input[value='Log In'])
  2. Rellenar input[name='username'] con el valor 'john'
    - expect: El campo acepta el valor sin error
  3. Rellenar input[name='password'] con el valor 'demo'
    - expect: El campo acepta el valor sin error
  4. Hacer click en input[value='Log In']
    - expect: La página redirige a /parabank/overview.htm
    - expect: Título de página: 'ParaBank | Accounts Overview'
    - expect: El sidebar izquierdo muestra el texto 'Welcome John Smith'
    - expect: El heading 'Account Services' (level 2) es visible en el sidebar
    - expect: El sidebar contiene el enlace 'Log Out' (href='logout.htm') — señal de sesión activa
    - expect: La zona derecha muestra heading 'Accounts Overview' (level 1)
    - expect: La tabla de cuentas contiene filas con columnas 'Account', 'Balance*', 'Available Amount'
    - expect: Cada fila de cuenta tiene un enlace al detalle (href='activity.htm?id=...')
    - expect: La fila 'Total' muestra el saldo consolidado

### 2. transfer-funds

**Seed:** ``

#### 2.1. Cliente autenticado transfiere un importe entre dos cuentas propias y ve confirmación

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Partiendo de sesión activa (usuario john, en /parabank/overview.htm), hacer click en el enlace 'Transfer Funds' (href='transfer.htm') del sidebar Account Services
    - expect: La página carga /parabank/transfer.htm
    - expect: Título: 'ParaBank | Transfer Funds'
    - expect: Aparece heading 'Transfer Funds' (level 1)
    - expect: Está presente: textbox de importe (input[id='amount'], label 'Amount: $')
    - expect: Está presente: combobox origen (select[id='fromAccountId'], label 'From account #') con todas las cuentas del usuario como options
    - expect: Está presente: combobox destino (select[id='toAccountId'], label 'to account #') con todas las cuentas del usuario como options
    - expect: Está presente: button 'Transfer' (button element con texto 'Transfer')
  2. Rellenar input[id='amount'] con el valor '10'
    - expect: El campo acepta el valor numérico
  3. Seleccionar una cuenta de origen en select[id='fromAccountId'] (p.ej. la primera cuenta con saldo positivo disponible)
    - expect: El select muestra la cuenta seleccionada
  4. Seleccionar una cuenta de destino diferente en select[id='toAccountId']
    - expect: El select muestra la cuenta de destino seleccionada, distinta de la de origen
  5. Hacer click en button 'Transfer'
    - expect: La página permanece en /parabank/transfer.htm (no hay redirect)
    - expect: La zona derecha (#rightPanel) muestra heading 'Transfer Complete!' (level 1)
    - expect: Aparece el párrafo de confirmación con el texto '$10.00 has been transferred from account #[origen] to account #[destino].'
    - expect: Aparece el párrafo 'See Account Activity for more details.'

### 3. logout

**Seed:** ``

#### 3.1. Cliente autenticado cierra sesión y vuelve a la pantalla de acceso

**File:** `tests/parabank/logout.spec.ts`

**Steps:**
  1. Partiendo de sesión activa (usuario john, en cualquier página autenticada), localizar el enlace 'Log Out' en el sidebar Account Services (a[href='logout.htm'])
    - expect: El enlace 'Log Out' es visible en el sidebar
  2. Hacer click en el enlace 'Log Out' (a[href='logout.htm'])
    - expect: La página redirige a /parabank/index.htm (con query param ?ConnType=JDBC opcional, URL canónica /parabank/index.htm)
    - expect: Título de página: 'ParaBank | Welcome | Online Banking'
    - expect: El formulario 'Customer Login' (heading level 2) es visible
    - expect: Están presentes: textbox username, textbox password, button 'Log In'
    - expect: El sidebar NO contiene el enlace 'Log Out' ni el texto 'Welcome John Smith'
    - expect: El sidebar NO contiene el menú Account Services de usuario autenticado

### 4. close-account

**Seed:** ``

#### 4.1. NO MAPEADO — close-account no existe en el DOM de ParaBank

**File:** `tests/parabank/close-account.spec.ts`

**Steps:**
  1. HALLAZGO DE MAPEO DOM: El flujo 'close-account' NO existe en la aplicación ParaBank. Evidencia recogida durante el mapeo: (1) El sidebar Account Services de usuario autenticado lista exactamente 8 ítems: Open New Account, Accounts Overview, Transfer Funds, Bill Pay, Find Transactions, Update Contact Info, Request Loan, Log Out. No hay ningún ítem 'Close Account' ni equivalente. (2) El sitemap (/parabank/sitemap.htm) no lista ninguna pantalla de cierre de cuenta. (3) La página de detalle de cuenta (/parabank/activity.htm?id=...) no expone ningún botón ni enlace de cierre. (4) Las URLs directas /parabank/closeaccount.htm, /parabank/close.htm y /parabank/deleteaccount.htm devuelven páginas sin título (recursos inexistentes). CONCLUSIÓN: El criterio de aceptación 'cliente cierra una de sus cuentas y deja de verla en el resumen' no tiene pantalla ni ruta realizables en este DOM. Este test NO debe implementarse como test automatizado contra ParaBank — hacerlo requeriría fabricar pasos que el DOM no soporta.
    - expect: Este escenario debe marcarse como BLOCKED o NOT APPLICABLE en el plan de pruebas
    - expect: Si el .feature declara este flujo como requisito, es un gap entre la especificación y la implementación real de ParaBank que debe reportarse al equipo
