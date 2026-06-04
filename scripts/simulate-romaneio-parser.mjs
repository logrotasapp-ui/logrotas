/**
 * Simulação: texto de romaneio → endereços → paradas do roteirizador.
 * Executar: node scripts/simulate-romaneio-parser.mjs
 */

import {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
} from "../src/services/romaneioRouting.js";

const SAMPLE_ROMANEIO = `
ROMANEIO DE ENTREGAS
Pedido: 12345
Data: 03/06/2025

1. Rua das Flores, 120 - Centro
   São Paulo - SP

2) Av. Paulista, 1578 - Bela Vista
   São Paulo SP | 01310-200

3. Trav. da Paz, 45, Jardim América
   Campinas - SP

• ENDEREÇO: Rod. Anhanguera, km 102 - Galpão 3
   Jundiaí - SP

Total: 4 entregas
`;

const SAMPLE_OCR_NOISY = `
ROMANEIO DE ENTREGAS
Pedido #8842

1. R. Augusta, 2500 - Consolação
São PauIo - SP

2) AV. BRIGADEIRO FARIA LIMA, 3477
Itaim Bibi | São Paulo - SP 04538-133

3. Travessa das Palmeiras 88
Santos - SP
`;

function runCase(name, text) {
  const addresses = parseRomaneioTextToDestinations(text);
  const paradas = buildParadasFromAddresses(addresses, 1000);

  console.log(`\n=== ${name} ===`);
  console.log("Endereços limpos:", addresses.length);
  addresses.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log("\nParadas (formato roteirizador):");
  console.log(JSON.stringify(paradas, null, 2));

  const valid =
    paradas.length >= 2 &&
    paradas.every(
      (p) =>
        typeof p.id === "number" &&
        typeof p.endereco === "string" &&
        p.endereco.length >= 10 &&
        /[a-zA-ZÀ-ú]/.test(p.endereco)
    );

  console.log(valid ? "✓ OK para optimizeDeliveryRoute" : "✗ FALHOU validação");
  return valid;
}

const a = runCase("Romaneio formatado", SAMPLE_ROMANEIO);
const b = runCase("OCR com ruído", SAMPLE_OCR_NOISY);

if (!a || !b) {
  process.exit(1);
}

console.log("\n✓ Simulação concluída: fluxo texto → endereços → paradas válido.\n");
