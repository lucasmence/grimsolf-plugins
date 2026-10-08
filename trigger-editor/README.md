# Grimsolf Trigger — extensão para VSCodium

Extensão de suporte à edição dos arquivos de trigger YAML do Grimsolf, com a mesma
funcionalidade do Trigger Editor do realm-editor, direto no editor:

- **Linguagem `grimsolf-trigger`**: arquivos `.yaml`/`.yml`/`.gtyaml` de trigger são
  reconhecidos e realçados (chaves de bloco, `event`/`condition`/`action`, parâmetros,
  strings, números, comentários).
- **Seleção de tipo**: ao digitar `- ` dentro de `events:`, `conditions:`, `then:` ou
  `else:`, o editor sugere **todos os 157 tipos** (12 eventos, 19 condições, 126 ações)
  com descrição — os mesmos metadados do editor visual do realm-editor.
- **Snippets prontos**: escolher um tipo insere a entrada completa com todos os
  parâmetros que o engine lê (`strings`, `integers`, `floats`, `booleans`, `floatValue`,
  `unitName`, ...) com placeholders navegáveis por Tab.
- **Hover docs**: passe o mouse sobre um nome de evento/condição/ação para ver a
  descrição e um exemplo de uso.
- **Validação ao vivo** (aba Problems): nomes de tipo desconhecidos, campos
  desconhecidos e chaves de bloco inválidas geram warnings com sugestão
  "did you mean" (distância de Levenshtein) para typos.
- **Comandos**:
  - `Grimsolf: Insert Trigger Block` — insere um bloco de trigger completo.
  - `Grimsolf: Insert Event/Condition/Action` (`Ctrl+Alt+G`) — escolhe o tipo em uma
    lista navegável e insere a entrada no cursor.

Os metadados (`trigger-defs.json`) são extraídos automaticamente de
`realm-editor/source/system/trigger/triggerDefs.cpp`, então o plugin e o editor
visual ficam sempre em sincronia.

---

## Instalação

### Opção A — instalar o `.vsix` pronto (recomendado)

O pacote já compilado está em `vscodium-plugin/grimsolf-trigger-1.0.0.vsix`.

1. Abra o VSCodium.
2. Abra a paleta de comandos: `Ctrl+Shift+P`.
3. Digite `Extensions: Install from VSIX...` e selecione o arquivo
   `grimsolf-trigger-1.0.0.vsix`.
4. Reinicie o VSCodium se solicitado.

Pela linha de comando, o mesmo pode ser feito com:

```bash
codium --install-extension vscodium-plugin/grimsolf-trigger-1.0.0.vsix
```

(No VS Code oficial o comando é `code --install-extension ...` — a extensão funciona
em ambos.)

### Opção B — compilar do código-fonte

Requisitos: Node.js 18+ e npm.

```bash
cd vscodium-plugin
npm install          # instala typescript + @types/vscode
npm run compile      # compila src/*.ts para out/*.js
npm run package      # gera grimsolf-trigger-1.0.0.vsix (usa @vscode/vsce)
```

Depois instale o `.vsix` gerado como na Opção A.

### Opção C — modo desenvolvimento (Execute and Debug)

Para modificar a extensão:

1. Abra a pasta `vscodium-plugin/` no VSCodium.
2. Rode `npm install` e `npm run compile`.
3. Pressione `F5` (ou `Run and Debug` → `Run Extension`) — uma janela do VSCodium
   com a extensão carregada será aberta.

---

## Uso

1. Abra um arquivo de trigger do jogo, por exemplo
   `data/maps/campaign/prologue/barbarian/trigger/nibbos-plaza.yaml`.
2. Confira no canto inferior direito que o modo está `Grimsolf Trigger`
   (arquivos `.yaml` são detectados automaticamente).
3. Dentro de `then:` ou `events:`, digite `- ` e espere o autocomplete:
   - A lista mostra todos os tipos válidos com a descrição ao lado.
   - `Enter` insere o snippet com placeholders (`Tab` navega entre eles).
4. Digite `event:`, `condition:` ou `action:` e o valor será sugerido após as aspas.
5. Erros de digitação aparecem em amarelo na aba **Problems** com a sugestão do nome
   mais próximo.

### Exemplo de fluxo

```yaml
trigger:
  - events:
      - event: "region-entered"
        unitName: "hero"
        integerValue: 100
    conditions:
      - condition: "unit-check-alive"
        strings:
          - value: "hero"
          - value: "guard"
        booleans:
          - value: true
    then:
      - action: "spawn-unit"          # digite "- " aqui e selecione na lista
        strings:
          - value: "enemies/goblin"   # placeholder "Unit path (string)"
          - value: "enemy"
        integers:
          - value: 150
          - value: 150
    else: []
```

---

## Configuração

| Setting | Default | Descrição |
|---|---|---|
| `grimsolfTrigger.dataPath` | `""` | Caminho da pasta do jogo (contém `data/`), reservado para validação de paths de units/quests/skills. Vazio desativa. |

---

## Estrutura do projeto

```
vscodium-plugin/
├── grimsolf-trigger-1.0.0.vsix          pacote pronto para instalar
├── package.json                          manifesto (linguagem, grammar, comandos)
├── language-configuration.json           comentários #, brackets, indentação
├── trigger-defs.json                     157 tipos extraídos de triggerDefs.cpp
├── syntaxes/grimsolf-trigger.tmLanguage.json   realce (TextMate grammar)
├── src/defs.ts                           modelo + snippets a partir dos metadados
├── src/extension.ts                      completion, hover, diagnósticos, comandos
├── tsconfig.json
└── out/                                  JS compilado (gerado)
```

## Sincronização dos metadados

Se novos eventos/condições/ações forem adicionados ao engine
(`realm-editor/source/system/trigger/triggerDefs.cpp`), regenere o JSON e reempacote:

```bash
cd vscodium-plugin
node extract-defs.js   # lê o C++ e reescreve trigger-defs.json
npm run package        # gera o .vsix atualizado
```

O extrator lê as tabelas `GUI_EVENT_DEFS` / `GUI_CONDITION_DEFS` / `GUI_ACTION_DEFS`
do C++ e escreve `vscodium-plugin/trigger-defs.json` (12 events, 19 conditions,
126 actions na versão atual).

## Desinstalação

```bash
codium --uninstall-extension grimsolf.grimsolf-trigger
```
