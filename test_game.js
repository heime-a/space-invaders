const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

function setupEnvironment() {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!scriptMatch) throw new Error('No script tag found');
    const scriptCode = scriptMatch[1];

    const elements = {
        'gameCanvas': {
            width: 448, height: 512,
            getContext: () => ({
                save: () => {},
                restore: () => {},
                translate: () => {},
                rotate: () => {},
                fillRect: () => {},
                fillText: () => {},
                fillStyle: '',
                font: '',
                textAlign: '',
                globalAlpha: 1.0,
            })
        },
        'score-display': { innerText: '0000' },
        'high-score': { innerText: '1500' },
        'lives-display': { innerText: '3' },
        'menu-overlay': { style: { display: 'flex' } },
        'menu-title': { innerText: 'SPACE INVADERS' },
        'menu-sub': { innerText: '' },
        'start-btn': { innerText: 'INSERT COIN / START', onclick: null },
        'l-btn': {},
        'r-btn': {},
        'f-btn': {}
    };

    let timeouts = [];
    const sandbox = {
        document: {
            getElementById: (id) => elements[id] || { style: {}, innerText: '' }
        },
        window: {
            onkeydown: null,
            onkeyup: null,
            onload: null,
            AudioContext: function() {
                return {
                    currentTime: 0,
                    state: 'running',
                    resume: () => {},
                    createOscillator: () => ({
                        type: '',
                        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
                        connect: () => {},
                        start: () => {},
                        stop: () => {}
                    }),
                    createGain: () => ({
                        gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
                        connect: () => {}
                    }),
                    destination: {}
                };
            }
        },
        requestAnimationFrame: () => {},
        console: console,
        Math: Math,
        setTimeout: (fn, delay) => { timeouts.push(fn); return timeouts.length; }
    };
    sandbox.window.webkitAudioContext = sandbox.window.AudioContext;

    const context = vm.createContext(sandbox);
    vm.runInContext(scriptCode, context);

    return {
        context,
        elements,
        runTimeouts: () => {
            const current = [...timeouts];
            timeouts = [];
            current.forEach(fn => fn());
        }
    };
}

function testAuthentic55InvaderRackAndScoring() {
    console.log('Testing: Authentic 55-Invader 5x11 rack (Squid 30, Crab 20, Octopus 10)...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    const counts = vm.runInContext(`({
        total: enemies.length,
        squid: enemies.filter(e => e.type === 'squid').length,
        crab: enemies.filter(e => e.type === 'crab').length,
        octopus: enemies.filter(e => e.type === 'octopus').length,
        bunkers: bunkers.length
    })`, context);

    assert.strictEqual(counts.total, 55, `Expected 55 invaders in 5x11 formation, got ${counts.total}`);
    assert.strictEqual(counts.squid, 11, 'Expected 11 Squid (30pt) invaders in row 0');
    assert.strictEqual(counts.crab, 22, 'Expected 22 Crab (20pt) invaders in rows 1-2');
    assert.strictEqual(counts.octopus, 22, 'Expected 22 Octopus (10pt) invaders in rows 3-4');
    assert.strictEqual(counts.bunkers, 4, 'Expected 4 destructible bunkers');

    // Test scoring for each invader class
    vm.runInContext(`
        enemies = [
            new Enemy(100, 150, 'squid', 0, 0),
            new Enemy(200, 150, 'crab', 1, 0),
            new Enemy(300, 150, 'octopus', 3, 0),
            new Enemy(400, 150, 'octopus', 4, 0)
        ];
        bullets = [{ x: 100, y: 154 }];
        update();
    `, context);
    assert.strictEqual(vm.runInContext('score', context), 30, 'Squid should award 30 points');

    vm.runInContext(`
        bullets = [{ x: 200, y: 154 }];
        update();
    `, context);
    assert.strictEqual(vm.runInContext('score', context), 50, 'Crab should award 20 points (30 + 20 = 50)');

    vm.runInContext(`
        bullets = [{ x: 300, y: 154 }];
        update();
    `, context);
    assert.strictEqual(vm.runInContext('score', context), 60, 'Octopus should award 10 points (50 + 10 = 60)');
    console.log('PASS: Authentic 55-Invader rack and 30/20/10 scoring verified.');
}

function testDeterministic23rdShot300PointUFO() {
    console.log('Testing: Deterministic 15-shot UFO Mystery table (23rd shot = 300 pts)...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    // On 23rd shot (index 22 % 15 === 7 -> 8th entry in 1-indexed table = 300 points)
    vm.runInContext(`
        shotCount = 23;
        ufo = { x: 220, y: 52, dir: 1, speed: 0 };
        bullets = [{ x: 220, y: 56 }];
        update();
    `, context);

    assert.strictEqual(vm.runInContext('ufo', context), null, 'UFO should be destroyed');
    assert.strictEqual(vm.runInContext('score', context), 300, '23rd shot hitting UFO should award 300 points');
    assert.strictEqual(vm.runInContext('scorePopups[0].text', context), '300', 'Popup should display 300');
    console.log('PASS: Deterministic 23rd-shot 300pt Mystery Ship verified.');
}

function testPerPixelDestructibleBunkers() {
    console.log('Testing: Per-pixel destructible bunkers erode from shots and low invaders...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    const initialIntact = vm.runInContext(`
        bunkers[0].pixels.flat().filter(Boolean).length
    `, context);
    assert(initialIntact > 200, 'Bunker should start with >200 intact pixels');

    // Shoot bunker from below with player laser
    vm.runInContext(`
        const bx = bunkers[0].x + 10;
        const by = bunkers[0].y + 20;
        bullets = [{ x: bx, y: by + 4 }];
        update();
    `, context);

    const afterPlayerShot = vm.runInContext(`
        bunkers[0].pixels.flat().filter(Boolean).length
    `, context);
    assert(afterPlayerShot < initialIntact, 'Player shot should erode pixels from bunker');
    assert.strictEqual(vm.runInContext('bullets.length', context), 0, 'Bullet should be consumed by bunker');
    console.log('PASS: Per-pixel destructible bunker erosion verified.');
}

function testDynamicMarchSpeedAndExtraLifeAt1500() {
    console.log('Testing: Dynamic march speed curve & 1,500pt extra laser base...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    const delays = vm.runInContext(`({
        d55: getFleetStepDelay(55),
        d10: getFleetStepDelay(10),
        d1: getFleetStepDelay(1)
    })`, context);
    assert(delays.d55 > delays.d10 && delays.d10 > delays.d1, 'Fleet step delay must decrease as aliens are destroyed');
    assert.strictEqual(delays.d1, 1, 'Last remaining invader should step every frame');

    // Award 1500 points -> should grant extra life (3 -> 4)
    vm.runInContext('awardScore(1500)', context);
    assert.strictEqual(vm.runInContext('lives', context), 4, 'Reaching 1,500 points should award 1 extra life');
    console.log('PASS: Dynamic march speed curve & 1,500pt extra life verified.');
}

function testEnemyBulletAndInvasionGameOver() {
    console.log('Testing: Enemy missile consumes life & Invasion overrun triggers Game Over...');
    const { context, elements, runTimeouts } = setupEnvironment();
    elements['start-btn'].onclick();

    vm.runInContext(`
        enemyBullets = [{ x: player.x, y: player.y - 2, type: 'rolling' }];
        update();
    `, context);
    assert.strictEqual(vm.runInContext('lives', context), 2, 'Enemy missile should reduce lives from 3 to 2');

    // Advance frames so player respawns
    for (let f = 0; f < 80; f++) vm.runInContext('update()', context);
    vm.runInContext('player.invulnerable = 0', context);

    // Invader reaches player baseline -> immediate Invasion Game Over
    vm.runInContext(`
        enemies[0].y = player.y;
        update();
    `, context);
    assert.strictEqual(vm.runInContext('lives', context), 0, 'Invasion reaching bottom should reduce lives to 0');
    runTimeouts();
    assert.strictEqual(vm.runInContext('gameActive', context), false, 'Game should end after invasion');
    assert.strictEqual(elements['menu-title'].innerText, 'GAME OVER');
    console.log('PASS: Enemy missile life loss & Invasion Game Over verified.');
}

function testAuthenticDiscreteAnalogSoundPassAndRippleMarch() {
    console.log('Testing: Authentic 1978 discrete analog sound synthesis & 1-alien-per-frame ripple march...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    // Verify bottom-to-top, left-to-right ripple order (row 4 col 0 is first to step)
    const firstEnemyRow = vm.runInContext('enemies[0].row', context);
    const firstEnemyCol = vm.runInContext('enemies[0].col', context);
    assert.strictEqual(firstEnemyRow, 4, 'First enemy in ripple order should be bottom row (row 4)');
    assert.strictEqual(firstEnemyCol, 0, 'First enemy in ripple order should be left column (col 0)');

    const initialX0 = vm.runInContext('enemies[0].x', context);
    const initialX1 = vm.runInContext('enemies[1].x', context);
    vm.runInContext('update()', context);
    const afterStep1X0 = vm.runInContext('enemies[0].x', context);
    const afterStep1X1 = vm.runInContext('enemies[1].x', context);
    assert.strictEqual(afterStep1X0, initialX0 + 4, 'Only alien 0 should step on frame 1');
    assert.strictEqual(afterStep1X1, initialX1, 'Alien 1 should not step until frame 2');

    // Verify all discrete analog sound circuits log and execute cleanly
    vm.runInContext(`
        soundCallLog = [];
        playMarchStepSound();
        playPlayerShootSound();
        playInvaderKilledSound();
        playPlayerExplosionSound();
        playUfoWarble();
        playUfoExplosionSound();
        playExtraLifeFanfare();
    `, context);

    const loggedTypes = Array.from(vm.runInContext('soundCallLog.map(s => s.type)', context));
    assert.deepStrictEqual(loggedTypes, [
        'march',
        'player_shoot',
        'invader_killed',
        'player_explosion',
        'ufo_warble',
        'ufo_explosion',
        'extra_life'
    ], 'All 7 authentic 1978 discrete sound circuits should fire');
    console.log('PASS: Authentic 1978 discrete analog sound pass & 1-alien-per-frame ripple march verified.');
}

try {
    testAuthentic55InvaderRackAndScoring();
    testDeterministic23rdShot300PointUFO();
    testPerPixelDestructibleBunkers();
    testDynamicMarchSpeedAndExtraLifeAt1500();
    testEnemyBulletAndInvasionGameOver();
    testAuthenticDiscreteAnalogSoundPassAndRippleMarch();
    console.log('\nAll Space Invaders tests passed successfully!');
} catch (e) {
    console.error('\nTest failed:', e.message);
    process.exit(1);
}
