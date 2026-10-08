# Grimsolf Sprite Viewer (extensão para VSCodium)

Extensão para **VSCodium** (e VS Code) que pré-visualiza os JSONs de textura do
Grimsolf:

1. **Clique no JSON de textura** → um popup mostra a folha de sprites inteira,
   resolvida pelo caminho do campo `texturename` (`resources/sprites/<texturename>.png`).
2. **Clique em um item da lista de animações** → um segundo popup reproduz a
   animação com a **mesma lógica do Sprite Editor** do jogo
   (`sprite-limit` = X do último frame, `speed` = segundos por frame,
   `loop`, `reverse-mode`, `side-flip`).

---

## 📁 Local dos arquivos

```
vscodium-grimsolf-sprite-viewer/
├── package.json          → manifesto da extensão (comandos, menus, atalho)
├── extension.js          → lógica principal (comandos, popups, CodeLens)
├── texture-utils.js      → lógica pura de parsing das texturas (testável)
├── media/
│   ├── sheetViewer.js    → popup 1: folha de sprites + lista de animações
│   ├── sheetViewer.css
│   ├── animViewer.js     → popup 2: player de animação
│   └── animViewer.css
└── README.md             → este arquivo
```

---

## 🚀 Instalação

A extensão **não tem dependências** (só usa a API do VSCodium + Node embutido),
então não precisa de `npm install`.

### Opção A — Instalar via VSIX (recomendada)

1. Abra um terminal na pasta da extensão:

   ```bash
   cd vscodium-grimsolf-sprite-viewer
   ```

2. Gere o pacote VSIX (precisa do `vsce`, uma vez só):

   ```bash
   npx @vscode/vsce package
   ```

   Isso cria um arquivo `grimsolf-sprite-viewer-1.0.0.vsix` na pasta.

3. No VSCodium: **Extensões** (Ctrl+Shift+X) → menu **...** (canto superior
   direito) → **Instalar a partir do VSIX...** → selecione o `.vsix` gerado.

### Opção B — Instalação manual (copiar a pasta)

Copie a pasta `vscodium-grimsolf-sprite-viewer` para a pasta de extensões do
VSCodium e renomeie com o padrão `publisher.nome-versao`:

- **Linux:** `~/.vscodium/extensions/grimsolf-sprite-viewer-1.0.0/`
- **Windows:** `%USERPROFILE%\.vscodium\extensions\grimsolf-sprite-viewer-1.0.0\`
- **macOS:** `~/.vscodium/extensions/grimsolf-sprite-viewer-1.0.0/`

Depois **reinicie o VSCodium** (ou clique em **Recarregar Janela**).

### Opção C — Rodar em modo desenvolvimento (F5)

1. Abra a pasta `vscodium-grimsolf-sprite-viewer` no VSCodium.
2. Pressione **F5** (precisa do pacote `@vscode/vscode` para os tipos — opcional;
   sem ele, crie a pasta `.vscode/` com `launch.json` usando a extensão de
   *Extension Development Host*).

---

## 🎮 Como usar

1. Abra o workspace do Grimsolf (a pasta raiz do jogo, ex.: `/mnt/d/Dev/grimsolf`)
   no VSCodium.
2. Abra um JSON de textura, ex.: `data/textures/unit/player/barbarian-prologue.json`.
3. Dispare o popup de uma destas formas:
   - Clique no **CodeLens** `👁 Preview sprite sheet` (aparece acima da linha 1);
   - **Clique com o botão direito** no editor → *Grimsolf: Show sprite sheet*;
   - **Ctrl+Alt+G** (atalho configurado);
   - Paleta de comandos (**Ctrl+Shift+P**) → *Grimsolf: Show sprite sheet*.
4. **Popup 1** (folha): mostra a imagem inteira (com zoom), as dimensões e a
   **lista de animações**. Cada card mostra nome, nº de frames, tamanho, speed,
   limit e flags (animated / loop / side-flip / reverse).
5. **Clique em uma animação** → abre o **Popup 2** (player):
   - reproduz os frames na velocidade `speed` (segundos por frame);
   - respeita `loop`, `reverse-mode` (ping-pong) e `side-flip` (espelhado);
   - controles: ▶/⏸, reiniciar, frame anterior/próximo, slider de frame,
     checkboxes *Loop* e *Side flip*, e zoom.

> A folha e a animação são procuradas em `resources/sprites/<texturename>.png`
> relativo à **raiz do workspace** (primeira pasta do workspace que contém o
> arquivo JSON). O código também tenta automaticamente a variante `unit/` ↔
> `units/` do caminho.

---

## ⚙️ Configuração

Em **Configurações** (Ctrl+,) → `grimsolfSpriteViewer`:

| Opção | Padrão | Descrição |
|---|---|---|
| `grimsolfSpriteViewer.spritesRoot` | `resources/sprites` | Pasta (relativa à raiz do workspace) onde ficam os PNGs das folhas de sprites. |
| `grimsolfSpriteViewer.defaultScale` | `1` | Zoom padrão dos popups (0.1 a 8). |

---

## 🧠 Como a lógica replica o Sprite Editor

- `sprite-limit` é o **X do último frame** da animação (não o tamanho da folha):
  `sprite-limit = (frames - 1) * largura do frame`.
- Nº de frames da animação = `(sprite-limit - left) / largura + 1`
  (um frame quando `sprite-limit` é 0 — ex.: a animação procedural `death`).
- `speed` = **segundos por frame** (0.15 → ~150 ms por frame).
- `reverse-mode` = ping-pong (frente e volta) quando `loop` está ligado.
- `side-flip` = espelha horizontalmente o frame desenhado.

## 🧹 Desinstalação

Extensões → procure por **Grimsolf Sprite Viewer** → ⚙️ → Desinstalar.
