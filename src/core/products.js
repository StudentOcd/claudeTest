// Real Auchan and Pingo Doce products for each catalogue food.
//
// Collected on 2026-09-24 from the stores' public product pages as indexed by
// web search. `seen` prices come from those pages/snippets and may be old or
// promotional: the app refreshes them live from each product page (from your
// own computer), and your receipts always win.
//
// sold: 'weight' => price is per kg; 'pack' => price per pack (packG / packUnits)

const AUCHAN = 'https://www.auchan.pt';
const PD = 'https://www.pingodoce.pt';

const a = (id, name, path, extra = {}) => ({ store: 'auchan', id, name, url: `${AUCHAN}${path}`, ...extra });
const p = (id, name, path, extra = {}) => ({ store: 'pingodoce', id, name, url: `${PD}${path}`, ...extra });

const SEEN = '2026-09';

export const STORE_PRODUCTS = {
  chicken_breast: {
    auchan: [
      a('2696458', 'Peito De Frango Auchan Kg', '/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html',
        { sold: 'weight', seen: { eur: 6.29, date: SEEN } }),
      a('506066', 'Peito De Frango Granel Kg', '/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-granel-kg/506066.html', { sold: 'weight' }),
    ],
    pingodoce: [
      p('544184', 'Bife/Peito de Frango Embalado Nosso Talho', '/home/produtos/talho/aves/frango/bife%2Fpeito-de-frango-embalado-nosso-talho-544184.html', { sold: 'weight' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/talho/frango-e-galinha/`,
      pingodoce: `${PD}/home/produtos/talho/frango-peru-e-pato`,
    },
  },
  turkey_steaks: {
    auchan: [
      a('2885521', 'Bife De Peru Auchan Kg', '/pt/produtos-frescos/talho/peru/bife-de-peru-auchan-kg/2885521.html',
        { sold: 'weight', seen: { eur: 6.49, date: SEEN } }),
    ],
    pingodoce: [
      p('442057', 'Peito/Bife de Peru Embalado Nosso Talho', '/home/produtos/talho/aves/peru/peito%2Fbife-de-peru-embalado-nosso-talho-442057.html',
        { sold: 'weight', seen: { eur: 8.99, date: SEEN } }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/talho/peru/`,
      pingodoce: `${PD}/home/produtos/talho/frango-peru-e-pato`,
    },
  },
  pork_loin: {
    auchan: [
      a('3352772', 'Lombo De Porco Sem Osso Vácuo Auchan Kg (slice it yourself)', '/pt/produtos-frescos/talho/porco/lombo-de-porco-sem-osso-vacuo-auchan-kg/3352772.html',
        { sold: 'weight', seen: { eur: 4.99, date: SEEN } }),
      a('3450499', 'Bifinhos Do Lombo Porco Auchan Kg', '/pt/produtos-frescos/talho/porco/bifinhos-do-lombo-porco-auchan-kg/3450499.html',
        { sold: 'weight', seen: { eur: 7.69, date: SEEN } }),
    ],
    pingodoce: [
      p('959144', 'Bifinhos do Lombo de Porco Embalados Pingo Doce', '/home/produtos/talho/porco/bifinhos-do-lombo-de-porco-embalados-pingo-doce-959144.html', { sold: 'weight' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/talho/porco/`,
      pingodoce: `${PD}/home/produtos/talho`,
    },
  },
  beef_mince_lean: {
    auchan: [
      a('778382', 'Carne Picada DOP Auchan 100% Bovino Alentejano 500g (congelada)', '/pt/alimentacao/congelados/carne/almondegas-e-carne-picada/carne-picada-dop-auchan-a-mesa-em-portugal-100-bovino-alentejano-500g/778382.html',
        { sold: 'pack', packG: 500 }),
      a('3667066', 'Preparado De Carne Picada Bovino 500gr', '/pt/produtos-frescos/talho/hamburgueres-e-carne-picada/preparado-de-carne-picada-bovino-500gr/3667066.html',
        { sold: 'pack', packG: 500, note: '"Preparado": 90% beef plus water, cornflour and additives.' }),
    ],
    pingodoce: [
      p('812474', 'Preparado de Carne Picada de Novilho Angus Embalado Nosso Talho', '/home/produtos/talho/vitela-vitelao-e-bovino/angus/preparado-de-carne-picada-de-novilho-angus-embalado-nosso-talho-812474.html',
        { sold: 'weight', note: '"Preparado": 90% beef plus water, corn flour and preservatives.' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/talho/hamburgueres-e-carne-picada/`,
      pingodoce: `${PD}/home/produtos/talho`,
    },
  },
  hake: {
    auchan: [
      a('780042', 'Filetes Auchan Pescada Do Cabo MSC 400g', '/pt/alimentacao/congelados/peixe/filetes-medalhoes-e-especialidades/filetes-auchan-pescada-do-cabo-msc-400g/780042.html',
        { sold: 'pack', packG: 400 }),
      a('51441', 'Lombos De Pescada Auchan 400g', '/pt/alimentacao/congelados/peixe/filetes-medalhoes-e-especialidades/lombos-de-pescada-auchan-400g/51441.html',
        { sold: 'pack', packG: 400 }),
    ],
    pingodoce: [
      p('38364', 'Medalhões de Pescada Congelados Pingo Doce', '/home/produtos/peixaria/peixe/pescada/medalhoes-de-pescada-congelados-pingo-doce-38364.html',
        { sold: 'pack', packG: 400 }),
      p('', 'Filetes de Pescada do Cabo MSC Congelados Pingo Doce 400 g', '/produtos/marca-propria-pingo-doce/pingo-doce/filetes-de-pescada-do-cabo-msc-congeladas-pingo-doce-400-g/',
        { sold: 'pack', packG: 400 }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/congelados/peixe/filetes-medalhoes-e-especialidades/`,
      pingodoce: `${PD}/home/produtos/peixaria/peixe`,
    },
  },
  cod_desalted: {
    auchan: [
      a('3933506', 'Bacalhau Demolhado Auchan Posta Média MSC 800g', '/pt/alimentacao/congelados/peixe/bacalhau/bacalhau-demolhado-auchan-posta-media-msc-800g/3933506.html',
        { sold: 'pack', packG: 800 }),
      a('2459338', 'Bacalhau Auchan Demolhado Lombos 500g', '/pt/alimentacao/congelados/peixe/bacalhau/bacalhau-auchan-demolhado-lombos-500g/2459338.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      p('948617', 'Postas de Bacalhau Congeladas Pingo Doce', '/home/produtos/peixaria/bacalhau/congelado/postas-de-bacalhau-congeladas-pingo-doce-948617.html', { sold: 'pack' }),
      p('948618', 'Lombos de Bacalhau Congelados Pingo Doce', '/home/produtos/congelados/peixe/bacalhau/lombos-de-bacalhau-congelados-pingo-doce-948618.html', { sold: 'pack' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/congelados/peixe/bacalhau/`,
      pingodoce: `${PD}/home/produtos/congelados/peixe/bacalhau`,
    },
  },
  salmon: {
    auchan: [
      a('559328', 'Salmão Posta Polegar Congelado Kg', '/pt/produtos-frescos/peixaria/peixe-congelado/salmao-posta-polegar-congelado-higienizado-kg/559328.html', { sold: 'weight' }),
      a('3291161', 'Posta Salmão Auchan Cultivamos O Bom Kg', '/pt/produtos-frescos/peixaria/peixe-fresco/posta-salmao-auchan-cultivamos-o-bom-kg/3291161.html',
        { sold: 'weight', seen: { eur: 16.99, date: SEEN } }),
    ],
    pingodoce: [
      p('908406', 'Postas de Salmão Congeladas Nossa Peixaria', '/home/produtos/peixaria/peixe/atum-e-salmao%E2%80%8B/postas-de-salmao-congeladas-nossa-peixaria-908406.html', { sold: 'weight' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/peixaria/peixe-fresco/`,
      pingodoce: `${PD}/home/produtos/peixaria/peixe`,
    },
  },
  tuna_water: {
    auchan: [
      a('1071642', 'Atum Posta Auchan Ao Natural 120(84)g', '/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-ao-natural-120(84)g/1071642.html',
        { sold: 'pack', packG: 84 }),
      a('2960052', 'Atum Ao Natural Auchan 185(130)g', '/pt/alimentacao/mercearia/conservas/atum/atum-ao-natural-auchan-185(130)g/2960052.html',
        { sold: 'pack', packG: 130, per100: { kcal: 98, p: 23 } }),
      a('3439741', 'Atum Posta Auchan Ao Natural 385(270)g', '/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-ao-natural-385(270)g/3439741.html',
        { sold: 'pack', packG: 270 }),
    ],
    pingodoce: [
      p('700040', 'Atum Posta ao Natural Bom Petisco', '/home/produtos/mercearia/conservas/atum/atum-posta-ao-natural-bom-petisco-700040.html', { sold: 'pack', packG: 84 }),
      p('825629', 'Atum ao Natural Vasco da Gama', '/home/produtos/mercearia/conservas/atum/atum-ao-natural-vasco-da-gama-825629.html', { sold: 'pack' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/mercearia/conservas/atum/`,
      pingodoce: `${PD}/home/produtos/mercearia/conservas/atum`,
    },
  },
  eggs: {
    auchan: [
      a('2945539', 'Ovos Auchan Galinhas Solo Classe M Uma Dúzia', '/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-no-solo/ovos-auchan-galinhas-solo-classe-m-uma-duzia/2945539.html',
        { sold: 'pack', packUnits: 12 }),
      a('446856', 'Ovos Auchan Galinhas Solo Classe M Duas Dúzias', '/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-no-solo/ovos-auchan-galinhas-solo-classe-m-duas-duzias/446856.html',
        { sold: 'pack', packUnits: 24 }),
    ],
    pingodoce: [
      p('889028', 'Ovos de Solo Classe M Pingo Doce (12 un)', '/home/produtos/as-nossas-marcas/pingo-doce/ovos-de-solo-classe-m-pingo-doce-889028.html',
        { sold: 'pack', packUnits: 12, seen: { eur: 3.09, date: SEEN } }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/produtos-lacteos/ovos/`,
      pingodoce: `${PD}/home/produtos/leite-natas-e-ovos/ovos`,
    },
  },
  egg_whites: {
    auchan: [
      a('301653', 'Clara Líquida Dovo Pasteurizada 1kg', '/pt/alimentacao/mercearia/leite-condensado-e-preparado-para-bolos/doces-pre-preparados-e-especialidades/clara-liquida-dovo-pasteurizada-1kg/301653.html',
        { sold: 'pack', packG: 1000 }),
      a('2354879', 'Clara De Ovo Prozis Líquida Natural UHT 500g', '/pt/alimentacao/biologicos-e-dietetica/nutricao-desportiva/preparacao-de-refeicoes-proteicas/clara-de-ovo-prozis-liquida-natural-uht-500g/2354879.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      p('929807', 'Clara de Ovo Go Active', '/home/produtos/as-nossas-marcas/go-active/clara-de-ovo-go-active-929807.html', { sold: 'pack' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/produtos-lacteos/ovos/claras-de-ovos/`,
      pingodoce: `${PD}/home/produtos/leite-natas-e-ovos/ovos`,
    },
  },
  turkey_ham: {
    auchan: [
      a('2112538', 'Fiambre De Peru Nobre Fatias Finas Cuida-te 110g', '/pt/produtos-frescos/charcutaria/fiambre-de-peru-e-frango/fiambre-de-peru-nobre-fatias-finas-cuida-te-110g/2112538.html',
        { sold: 'pack', packG: 110, note: 'Check the label for milk proteins before buying.' }),
    ],
    pingodoce: [
      p('991954', 'Fiambre Peito de Peru Fatias Finas Pingo Doce', '/home/produtos/charcutaria-e-queijos/charcutaria/fiambre-mortadela-e-chouricao%E2%80%8B/fiambre-peito-de-peru-fatias-finas-pingo-doce-991954.html',
        { sold: 'pack', note: 'Check the label for milk proteins before buying.' }),
      p('846884', 'Fiambre Peito de Peru Extra Fatias Finas Nobre (66% peru)', '/home/produtos/charcutaria/fiambre-e-mortadela/fiambre-peito-de-peru-extra-fatias-finas-nobre-846884.html',
        { sold: 'pack' }),
    ],
    avoid: [
      { store: 'auchan', id: '3803966', name: 'Fiambre De Peito Peru Auchan Fatias 150g', reason: 'Contains milk proteins (only 60% turkey).' },
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/charcutaria/fiambre-de-peru-e-frango/`,
      pingodoce: `${PD}/home/produtos/charcutaria/fiambre-e-mortadela`,
    },
  },
  rice_white: {
    auchan: [
      a('1193801', 'Arroz Agulha Auchan Extra Longo Branqueado 1kg', '/pt/alimentacao/mercearia/arroz-e-massa/arroz/arroz-agulha-auchan-extra-longo-branqueado-1kg/1193801.html',
        { sold: 'pack', packG: 1000 }),
    ],
    pingodoce: [
      p('', 'Arroz Agulha Uruguai Pingo Doce 1 kg', '/produtos/marca-propria-pingo-doce/pingo-doce/arroz-agulha-uruguai-pingo-doce-1kg/',
        { sold: 'pack', packG: 1000, seen: { eur: 1.45, date: SEEN } }),
      p('651179', 'Arroz Vaporizado Pingo Doce 1 kg', '/home/produtos/mercearia/arroz-e-massa/arroz-/arroz-vaporizado-pingo-doce-651179.html',
        { sold: 'pack', packG: 1000, seen: { eur: 1.35, date: SEEN } }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/mercearia/arroz-e-massa/arroz/`,
      pingodoce: `${PD}/home/produtos/mercearia/arroz-massa-e-leguminosas/arroz`,
    },
  },
  potatoes: {
    auchan: [
      a('429764', 'Batata Para Cozer Auchan Saco 3kg', '/pt/produtos-frescos/legumes/batatas-alho-e-cebola/batata-para-cozer-auchan-saco-3kg/429764.html',
        { sold: 'pack', packG: 3000 }),
    ],
    pingodoce: [
      p('454634', 'Batata para Cozer e Assar Embalada Pingo Doce 3 kg', '/home/produtos/frutas-e-vegetais/vegetais/batatas-cebolas-e-alhos/batata-para-cozer-e-assar-embalada-pingo-doce-454634.html',
        { sold: 'pack', packG: 3000, seen: { eur: 3.69, date: SEEN } }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/produtos-frescos/legumes/batatas-alho-e-cebola/`,
      pingodoce: `${PD}/home/produtos/frutas-e-vegetais/vegetais`,
    },
  },
  sweet_potato: {
    auchan: [a('239302', 'Batata Doce Kg', '/pt/produtos-frescos/legumes/batatas-alho-e-cebola/batata-doce-kg/239302.html', { sold: 'weight' })],
    pingodoce: [
      p('878038', 'Batata Doce Nossa Fruta e Legumes', '/home/produtos/frutas-e-vegetais/vegetais/batatas-cebolas-e-alhos/batata-doce-nossa-fruta-e-legumes-878038.html', { sold: 'weight' }),
    ],
  },
  pasta: {
    auchan: [
      a('3771760', 'Esparguete Auchan 500g', '/pt/alimentacao/mercearia/arroz-e-massa/esparguete-aletria-e-meadas/esparguete-auchan-500g/3771760.html',
        { sold: 'pack', packG: 500 }),
      a('2749257', 'Massa Auchan Esparguete Sem Glúten 500g', '/pt/biologicos-e-alternativas/sem-gluten/mercearia-sem-gluten/massas-e-farinhas-sem-gluten/massa-auchan-esparguete-sem-gluten-500g/2749257.html',
        { sold: 'pack', packG: 500, note: 'Gluten-free (no wheat fructans).' }),
    ],
    pingodoce: [
      p('895467', 'Massa Esparguete Pack Poupança Pingo Doce', '/home/produtos/as-nossas-marcas/pingo-doce/massa-esparguete-pack-poupanca-pingo-doce-895467.html', { sold: 'pack' }),
      p('850741', 'Massa Esparguete Nacional 500 g', '/home/produtos/mercearia/arroz-massa-e-leguminosas/massa/massa-esparguete-nacional-850741.html', { sold: 'pack', packG: 500 }),
    ],
  },
  oats: {
    auchan: [
      a('3910503', 'Flocos De Aveia Auchan Finos E Integrais 500g', '/pt/alimentacao/mercearia/cereais-e-barras/flocos-cereais/flocos-de-aveia-auchan-finos-e-integrais-500g/3910503.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      p('', 'Flocos de Aveia Integral Grossos Pingo Doce 500 g', '/produtos/marca-propria-pingo-doce/pingo-doce/flocos-de-aveia-integral-grossos-pingo-doce-500-g/',
        { sold: 'pack', packG: 500 }),
    ],
  },
  bread: {
    auchan: [
      a('3935465', 'Pão De Forma Auchan Sem Côdea 450g', '/pt/alimentacao/mercearia/tostas-e-pao-embalado/pao-embalado/pao-de-forma-auchan-sem-codea-450g/3935465.html',
        { sold: 'pack', packG: 450 }),
    ],
    pingodoce: [
      p('', 'Pão de Forma Branco sem Côdea Pingo Doce 450 g', '/produtos/marca-propria-pingo-doce/pingo-doce/pao-de-forma-branco-sem-codea-pingo-doce-450-g/',
        { sold: 'pack', packG: 450 }),
      p('960274', 'Pão de Forma sem Glúten Pingo Doce', '/home/produtos/padaria-e-pastelaria/pao-embalado/pao-de-forma-e-embalado/pao-de-forma-sem-gluten-pingo-doce-960274.html',
        { sold: 'pack', note: 'Gluten-free (no wheat fructans).' }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/mercearia/tostas-e-pao-embalado/pao-embalado/`,
      pingodoce: `${PD}/home/produtos/padaria-e-pastelaria/pao-embalado/pao-de-forma-e-embalado`,
    },
  },
  rice_cakes: {
    auchan: [
      a('2894190', 'Tortitas Auchan Arroz Sem Sal 130g', '/pt/alimentacao/biologicos-e-dietetica/mercearia-dietetica/galetes-de-milho-arroz-e-especialidades/tortitas-auchan-arroz-sem-sal-130g/2894190.html',
        { sold: 'pack', packG: 130 }),
    ],
    pingodoce: [
      p('', 'Tortitas de Arroz com Sal Pura Vida 130 g', '/produtos/marca-propria-pingo-doce/pura-vida/tortitas-de-arroz-com-sal-pura-vida-130g/',
        { sold: 'pack', packG: 130 }),
    ],
  },
  olive_oil: {
    auchan: [
      a('3829991', 'Azeite Virgem Extra Auchan 3 L', '/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/azeite-virgem-e-extra-virgem/azeite-virgem-extra-auchan-3-l/3829991.html',
        { sold: 'pack', packG: 2760 }),
    ],
    pingodoce: [
      p('', 'Azeite Virgem Extra Nossas Planícies Pingo Doce 0,75 L', '/produtos/marca-propria-pingo-doce/pingo-doce/azeite-das-nossas-planicies-virgem-extra-pingo-doce-750ml-250ml-gratis/',
        { sold: 'pack', packG: 690, seen: { eur: 4.29, date: SEEN } }),
      p('', 'Azeite Virgem Extra Nossas Planícies Pingo Doce 3 L', '/produtos/marca-propria-pingo-doce/pingo-doce/azeite-das-nossas-planicies-virgem-pingo-doce-3-l/',
        { sold: 'pack', packG: 2760, seen: { eur: 15.99, date: SEEN } }),
    ],
    categories: {
      auchan: `${AUCHAN}/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/azeite-virgem-e-extra-virgem/`,
      pingodoce: `${PD}/home/produtos/mercearia/azeite-oleo-e-vinagre/azeite`,
    },
  },
  peanut_butter: {
    auchan: [
      a('3503408', 'Manteiga Amendoim Auchan 100% & Cremosa 500g', '/pt/alimentacao/mercearia/cremes-compotas-e-mel/cremes-de-barrar/manteiga-amendoim-auchan-100-e-cremosa-500g/3503408.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      { store: 'pingodoce', id: '', name: 'Manteiga de Amendoim Go Active (100% amendoim)', url: '', sold: 'pack', seen: { eur: 3.75, date: SEEN } },
    ],
  },
  carrots: {
    auchan: [
      a('3374262', 'Cenoura Auchan Cultivamos O Bom 1 Kg', '/pt/produtos-frescos/legumes/abobora-cenoura-e-alho-frances/cenoura-auchan-cultivamos-o-bom-1-kg/3374262.html',
        { sold: 'pack', packG: 1000 }),
    ],
    pingodoce: [
      p('906668', 'Cenoura Embalada Nossos Frescos 2 kg', '/home/produtos/frutas-e-vegetais/vegetais/cenouras-couves-e-brocolos/cenoura-embalada-nossos-frescos-906668.html',
        { sold: 'pack', packG: 2000, seen: { eur: 2.09, date: SEEN } }),
    ],
  },
  courgette: {
    auchan: [a('28564', 'Curgete Kg', '/pt/produtos-frescos/legumes/curgete-nabicas-nabo-e-grelos/curgete-kg/28564.html', { sold: 'weight' })],
    pingodoce: [
      p('42855', 'Curgete Nossa Fruta e Legumes', '/home/produtos/frutas-e-vegetais/vegetais/outros-vegetais/curgete-nossa-fruta-e-legumes-42855.html', { sold: 'weight' }),
    ],
  },
  green_beans: {
    auchan: [
      a('983849', 'Feijão Verde Auchan Extra Fino 1kg (congelado)', '/pt/alimentacao/congelados/legumes-e-frutas/legumes-simples/feijao-verde-auchan-extra-fino-1kg/983849.html',
        { sold: 'pack', packG: 1000, per100: { kcal: 38, p: 2.3, c: 4.3, fib: 4.8 } }),
    ],
    pingodoce: [
      p('', 'Feijão Verde Cortado Pingo Doce 450 g (congelado)', '/produtos/marca-propria-pingo-doce/pingo-doce/feijao-verde-cortado-pingo-doce-450g/',
        { sold: 'pack', packG: 450 }),
      p('900660', 'Feijão Verde Embalado Pingo Doce (fresco)', '/home/produtos/frutas-e-vegetais/vegetais/outros-vegetais/feijao-verde-embalado-pingo-doce-900660.html', { sold: 'pack' }),
    ],
  },
  spinach: {
    auchan: [
      a('2533216', 'Espinafres Auchan Folhas Porções 1kg', '/pt/alimentacao/congelados/legumes-e-frutas/legumes-simples/espinafres-auchan-folhas-porcoes-1kg/2533216.html',
        { sold: 'pack', packG: 1000 }),
    ],
    pingodoce: [
      p('323609', 'Espinafres em Folha Congelados', '/home/congelados/espinafres-em-folha-congelados/323609.html', { sold: 'pack' }),
    ],
    avoid: [{ store: 'auchan', id: '2650403', name: 'Espinafres Auchan Salteados Com Alho 750g', reason: 'Contains garlic.' }],
  },
  broccoli: {
    auchan: [
      a('465336', 'Brócolos Auchan 1kg (congelados)', '/pt/alimentacao/congelados/legumes-e-frutas/legumes-simples/brocolos-auchan-1kg/465336.html',
        { sold: 'pack', packG: 1000 }),
    ],
    pingodoce: [
      p('956036', 'Brócolos Congelados Pingo Doce', '/home/produtos/congelados/frutas-e-vegetais/vegetais/brocolos-congelados-pingo-doce-956036.html',
        { sold: 'pack', packG: 400 }),
    ],
  },
  red_pepper: {
    auchan: [a('21990', 'Pimento Vermelho Kg', '/pt/produtos-frescos/legumes/tomate-pepino-e-pimentos/pimento-vermelho-kg/21990.html', { sold: 'weight' })],
    pingodoce: [],
  },
  cucumber: {
    auchan: [a('234025', 'Pepino Kg', '/pt/produtos-frescos/legumes/tomate-pepino-e-pimentos/pepino-kg/234025.html', { sold: 'weight' })],
    pingodoce: [],
  },
  passata: {
    auchan: [
      a('3528662', 'Polpa De Tomate Auchan 500g', '/pt/alimentacao/mercearia/polpas-caldos-e-temperos/polpa-tomate/polpa-de-tomate-auchan-500g/3528662.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      p('', 'Polpa de Tomate Pingo Doce 500 g', '/produtos/marca-propria-pingo-doce/pingo-doce/polpa-de-tomate-pingo-doce-500-g/',
        { sold: 'pack', packG: 500, seen: { eur: 0.99, date: SEEN } }),
    ],
    avoid: [
      { store: 'auchan', id: '3556858', name: 'Polpa De Tomate Auchan Com Cebola E Alho 500g', reason: 'Contains onion and garlic.' },
      { store: 'pingodoce', id: '', name: 'Polpa de Tomate com Cebola e Alho Pingo Doce', reason: 'Contains onion and garlic.' },
    ],
  },
  lemon: {
    auchan: [
      a('20578', 'Limão Kg', '/pt/produtos-frescos/fruta/laranjas-clementinas-e-limoes/limao-kg/20578.html', { sold: 'weight', seen: { eur: 2.29, date: SEEN } }),
    ],
    pingodoce: [],
  },
  banana: {
    auchan: [
      a('234229', 'Banana Del Monte Kg', '/pt/produtos-frescos/fruta/banana-e-frutos-tropicais/banana-del-monte-kg/234229.html',
        { sold: 'weight', seen: { eur: 1.99, date: SEEN } }),
    ],
    pingodoce: [
      p('43218', 'Banana Importada Nossa Fruta e Legumes', '/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/banana-importada-nossa-fruta-e-legumes-43218.html',
        { sold: 'weight', seen: { eur: 1.29, date: SEEN } }),
    ],
  },
  kiwi: {
    auchan: [
      a('3424980', 'Kiwi Auchan Cultivamos O Bom 1 Kg', '/pt/produtos-frescos/fruta/fruta-da-epoca/kiwi-auchan-cultivamos-o-bom-1-kg/3424980.html',
        { sold: 'pack', packG: 1000 }),
    ],
    pingodoce: [
      p('31239', 'Kiwi Verde Nossa Fruta e Legumes', '/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/kiwi-verde-nossa-fruta-e-legumes-31239.html', { sold: 'weight' }),
    ],
  },
  lf_yogurt: {
    auchan: [
      a('3921275', 'Iogurte Natural Magro Auchan Sem Lactose 4x125g', '/pt/alimentacao/produtos-lacteos/sem-lactose/iogurte-sem-lactose/iogurte-natural-magro-auchan-sem-lactose-4x125g/3921275.html',
        { sold: 'pack', packG: 500 }),
    ],
    pingodoce: [
      p('992642', 'Iogurte sem Lactose Natural Pingo Doce', '/home/produtos/iogurtes-e-sobremesas/iogurtes/naturais%E2%80%8B/iogurte-natural-sem-lactose-pingo-doce-992642.html',
        { sold: 'pack' }),
    ],
  },
};

// Every known product for a food at a store (the first one is the default pick).
export function productsFor(foodId, store) {
  return STORE_PRODUCTS[foodId]?.[store] || [];
}

export function avoidListFor(foodId) {
  return STORE_PRODUCTS[foodId]?.avoid || [];
}

export function categoryUrl(foodId, store) {
  return STORE_PRODUCTS[foodId]?.categories?.[store] || null;
}

// Price entries (same shape as user-entered prices) from the seen prices above.
export function seenPriceEntries() {
  const out = {};
  for (const [foodId, byStore] of Object.entries(STORE_PRODUCTS)) {
    for (const store of ['auchan', 'pingodoce']) {
      for (const prod of byStore[store] || []) {
        if (!prod.seen) continue;
        (out[foodId] ||= []).push({
          store,
          sold: prod.sold,
          eur: prod.seen.eur,
          packG: prod.packG,
          packUnits: prod.packUnits,
          date: prod.seen.date,
          source: 'web',
          productName: prod.name,
          url: prod.url,
        });
        break; // first product with a price is the default pick
      }
    }
  }
  return out;
}
