export const SAVE_KEY = 'zhongxi-isle-v2';
export const VERSION = 2;
export const FIXED_DT = 1 / 20;
export const DAY_SECONDS = 360;
export const NEST = Object.freeze({ x: 5, z: 9 });
export const WORLD_RADIUS = 46;
export const JOBS = { forage: '采集', build: '营造', guard: '守卫' };
export const BIOMES = [
  { id: 'meadow', name: '初生原野', x: 6, z: 10, color: '#adce77', description: '浆果与嫩草丰沛，是族群安家的地方。' },
  { id: 'wetland', name: '镜水湿地', x: -20, z: 9, color: '#6fbec2', description: '浅水隔开了陆地，蹼足能让你涉水探索。' },
  { id: 'grove', name: '低语林地', x: -8, z: -19, color: '#84b19c', description: '古树之间藏着远古孢子，也有温顺的野生邻居。' },
  { id: 'ridge', name: '赤岩高地', x: 22, z: -20, color: '#d7b88a', description: '矿石丰富。留意那些长着红色背鳍的猎食者。' },
];
export const EVOLUTIONS = [
  { id: 'legs', name: '轻盈长足', category: '移动', icon: 'foot', cost: 18, description: '四肢伸展，探索得更远。', effect: '移速 +25% · 体力消耗 +10%', stats: { speed: .25, drain: .1 } },
  { id: 'shell', name: '苔纹背甲', category: '防御', icon: 'shield', cost: 24, description: '长出厚实的护甲，从容面对天敌。', effect: '受伤 −40% · 移速 −8%', stats: { armor: .4, speed: -.08 } },
  { id: 'horns', name: '弯月双角', category: '攻击', icon: 'horn', cost: 24, description: '用双角抵御猎食者，也能主动捕猎。', effect: '攻击 +70% · 采食体力 +15%', stats: { attack: .7, drain: .15 } },
  { id: 'fins', name: '潮汐侧鳍', category: '适应', icon: 'water', cost: 26, description: '侧鳍和宽足带你进入湿地深水。', effect: '解锁游泳 · 水中速度 80%', stats: { swim: 1 } },
  { id: 'crest', name: '共鸣冠饰', category: '社群', icon: 'sun', cost: 30, description: '同伴更容易听见你的召唤。', effect: '同伴效率 +20% · 召唤范围 +8', stats: { efficiency: .2, rallyRadius:8 } },
  { id: 'tail', name: '蓄能长尾', category: '生存', icon: 'leaf', cost: 22, description: '丰满的长尾能储存更多能量。', effect: '背包 +8 · 体力上限 +25', stats: { carry: 8, stamina: 25 } },
  { id:'sprinter',parent:'legs',biome:'grove',name:'疾风后肢',category:'追逐',icon:'foot',cost:28,description:'后肢与平衡鳍一同伸展，追上林中的游食兽。',effect:'移速再 +20% · 奔跑消耗 −15%',stats:{speed:.20,drain:-.15} },
  { id:'digger',parent:'legs',biome:'ridge',name:'掘土前爪',category:'采集',icon:'stone',cost:28,description:'前爪长出弯曲的掘齿，更快撬开石缝。',effect:'采集速度 +50% · 背包 +4 · 移速 −6%',stats:{harvest:.5,carry:4,speed:-.06} },
  { id:'bulwark',parent:'shell',biome:'ridge',name:'磐石重甲',category:'坚守',icon:'shield',cost:32,description:'层层叠合的甲片包住身体，换取更稳妥的防护。',effect:'减伤再 +18% · 移速 −10%',stats:{armor:.18,speed:-.1} },
  { id:'thorns',parent:'shell',biome:'grove',name:'棘刺护甲',category:'反击',icon:'horn',cost:32,description:'背甲边缘生出骨刺，接触你的敌人也会受伤。',effect:'受击反伤 4 · 减伤再 +5%',stats:{thorns:4,armor:.05} },
  { id:'fangs',parent:'horns',biome:'ridge',name:'锯齿獠牙',category:'捕猎',icon:'horn',cost:34,description:'下颚生出交错的长牙，连续咬击更加迅速。',effect:'攻击再 +45% · 攻击间隔 −0.15 秒',stats:{attack:.45,attackInterval:-.15} },
  { id:'venom',parent:'horns',biome:'wetland',name:'毒腺囊',category:'毒素',icon:'water',cost:34,description:'颊侧腺囊积存毒液，咬伤后持续侵蚀猎物。',effect:'命中附带每秒 3 点毒伤，持续 4 秒',stats:{poison:3} },
  { id:'gills',parent:'fins',biome:'wetland',name:'潮息鳃冠',category:'水行',icon:'water',cost:28,description:'展开鳃冠，让水流顺着身体滑过。',effect:'水中速度提升至陆地的 120%',stats:{swimSpeed:.4} },
  { id:'sifter',parent:'fins',biome:'wetland',name:'沼泽长吻',category:'寻宝',icon:'leaf',cost:28,description:'宽长的吻部翻开淤泥，找到遗落的食物与生命印记。',effect:'湿地采集 +60% · 研究速度 +50%',stats:{wetHarvest:.6,research:.5} },
  { id:'antennae',parent:'crest',biome:'grove',name:'领航触角',category:'远行',icon:'sun',cost:30,description:'分叉触角传递更远的信号，让守卫伴你远行。',effect:'召唤范围再 +12 · 跟随时间 +20 秒',stats:{rallyRadius:12,rallyDuration:20} },
  { id:'brood',parent:'crest',name:'群巢冠瓣',category:'家园',icon:'nest',cost:30,description:'暖色冠瓣传达协作信号，巢群搬运与孵育更有效率。',effect:'同伴背包 +4 · 孵育速度 +50%',stats:{workerCarry:4,hatchSpeed:.5} },
  { id:'reservoir',parent:'tail',name:'琥珀脂尾',category:'储备',icon:'bag',cost:26,description:'尾部膨大的储能囊能支持一次满载而归的远行。',effect:'背包再 +12 · 体力再 +35 · 移速 −10%',stats:{carry:12,stamina:35,speed:-.1} },
  { id:'regrowth',parent:'tail',biome:'grove',name:'愈合尾芽',category:'恢复',icon:'leaf',cost:26,description:'尾端的嫩芽缓缓修补身体，脱离战斗后就会开始生长。',effect:'脱战 6 秒后每秒恢复 0.6 生命 · 体力恢复 +30%',stats:{regen:.6,staminaRegen:.3} },
];
export const SPECIES={
  mossback:{name:'苔背团兽',asset:'mossback',kind:'grazer',biome:'meadow',hp:55,speed:1.1,flee:2.5,scale:1.0,upper:.18,lower:.20,description:'矮胖的食草兽，甲背长着苔藓。动作缓慢，受惊后会避开来者。'},
  reedbeak:{name:'长喙泽鸟',asset:'reedbeak',kind:'grazer',biome:'wetland',hp:32,speed:1.7,flee:4.5,swim:true,scale:1.0,upper:.46,lower:.48,description:'双足涉禽，细长的吻和宽脚适合在浅水中翻找食物。'},
  emberfang:{name:'赤鬃猎兽',asset:'emberfang',kind:'predator',biome:'ridge',hp:64,speed:4.0,attack:8,scale:1.05,upper:.34,lower:.34,description:'长身、尖颚、赤色背鬃。会主动追逐附近的小动物。'},
  glowbug:{name:'灯囊浮虫',asset:'glowbug',kind:'grazer',biome:'grove',hp:20,speed:1.8,flee:3.8,fly:true,swim:true,scale:.8,upper:.12,lower:.12,description:'振动四片薄翼，在花木上方漂游。腹部的光囊入夜后格外明亮。'},
};
export const APPEARANCES=[
  {id:'fern',name:'苔青',color:'#4c9a78',belly:'#d4df8a',accent:'#e79267'},
  {id:'sand',name:'砂金',color:'#bc9257',belly:'#f0d9a0',accent:'#bb654d'},
  {id:'tide',name:'潮蓝',color:'#579ba4',belly:'#cce5cd',accent:'#b4a1d3'},
  {id:'berry',name:'莓红',color:'#b96e80',belly:'#edccac',accent:'#91b58b'},
];
export const BUILDINGS = [
  { id: 'nest', name: '育幼巢', icon: 'nest', cost: { food: 12, material: 14 }, work: 26, max: 3, description: '用枝条围出温暖的新家。', effect: '族群容量 +4' },
  { id: 'garden', name: '浆果圃', icon: 'leaf', cost: { food: 8, material: 12 }, work: 22, max: 3, description: '在巢边栽种一片食物来源。', effect: '每分钟 +5 食物' },
  { id: 'cache', name: '储藏堆', icon: 'box', cost: { food: 4, material: 16 }, work: 20, max: 2, description: '把收获稳妥地存放起来。', effect: '食物与材料上限 +60' },
];
export const QUESTS = [
  { id: 'gather', title: '世界的第一口滋味', description: '点击附近的浆果丛，让小芽去采集。', target: 6, metric: 'gathered', reward: 8, label: '采集食物' },
  { id: 'home', title: '把收获带回家', description: '靠近巢穴，背包里的资源会自动入库。', target: 6, metric: 'deposited', reward: 10, label: '带回资源' },
  { id: 'evolve', title: '生命有了新的模样', description: '回到巢边，打开进化，长出第一个新部件。', target: 1, metric: 'evolved', reward: 12, label: '完成进化' },
  { id: 'build', title: '从落脚处，到家园', description: '建造一座设施，分配营造同伴完成它。', target: 1, metric: 'built', reward: 12, label: '建成设施' },
  { id: 'explore', title: '越过熟悉的草地', description: '沿陆地探索低语林地或赤岩高地。', target: 3, metric: 'discovered', reward: 16, label: '发现栖息地' },
  { id: 'colony', title: '小小族群的未来', description: '准备食物和育幼巢，孵育新的同伴。', target: 8, metric: 'population', reward: 20, label: '族群成员' },
];
export function speciesStats(parts = []) {
  const s = { speed: 4.3, armor: 0, attack: 12, carry: 12, stamina: 100, drain: 1, swim: false, efficiency: 1,harvest:1,research:1,wetHarvest:0,swimSpeed:.8,rallyRadius:14,rallyDuration:22,workerCarry:6,hatchSpeed:1,regen:0,staminaRegen:1,poison:0,thorns:0,attackInterval:.85 };
  let speed = 1, attack = 1;
  for (const p of EVOLUTIONS.filter(e => parts.includes(e.id))) {
    speed += p.stats.speed || 0; attack += p.stats.attack || 0;
    s.armor += p.stats.armor || 0; s.carry += p.stats.carry || 0; s.stamina += p.stats.stamina || 0;
    s.drain += p.stats.drain || 0; s.efficiency += p.stats.efficiency || 0; s.swim ||= !!p.stats.swim;
    for(const key of ['harvest','research','wetHarvest','swimSpeed','rallyRadius','rallyDuration','workerCarry','hatchSpeed','regen','staminaRegen','poison','thorns','attackInterval'])s[key]+=p.stats[key]||0;
  }
  s.speed *= speed; s.attack *= attack;
  return s;
}
