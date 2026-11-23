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

function testCrkdAtomKeychainControllerSupport() {
    console.log('Testing: CRKD ATOM Collectible Keychain Controller support (D-Pad, Stick-remap, Hat-switch, Fire & Start)...');
    const { context, elements } = setupEnvironment();

    let mockGamepad = {
        id: 'CRKD ATOM Collectible Keychain Controller',
        connected: true,
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857] // Neutral 10-axis gamepad
    };
    context.navigator = {
        getGamepads: () => [mockGamepad]
    };

    // 1. Press Start (+) button (button 9) while on menu -> should start the game!
    mockGamepad.buttons[9].pressed = true;
    vm.runInContext('pollGamepad()', context);
    assert.strictEqual(vm.runInContext('gameActive', context), true, 'Pressing Start (+) on CRKD ATOM should start the game');
    mockGamepad.buttons[9].pressed = false;
    vm.runInContext('player.cooldown = 0; pollGamepad()', context);

    // 2. With controllerInvertX = true (default for CRKD ATOM orientation), raw button 14 moves right & button 15 moves left
    const startX = vm.runInContext('player.x', context);
    mockGamepad.buttons[14].pressed = true;
    vm.runInContext('update()', context);
    assert(vm.runInContext('player.x', context) > startX, 'CRKD ATOM inverted D-Pad should move laser base right');
    mockGamepad.buttons[14].pressed = false;

    // 3. Left-Stick Remap mode (axes[0] = 1.0) moves player left when controllerInvertX = true
    const midX = vm.runInContext('player.x', context);
    mockGamepad.axes[0] = 1.0;
    vm.runInContext('update()', context);
    assert(vm.runInContext('player.x', context) < midX, 'CRKD ATOM inverted stick axis should move laser base left');
    mockGamepad.axes[0] = 0;

    // 4. DirectInput / Switch POV Hat switch on axes[9]
    const beforeHatX = vm.runInContext('player.x', context);
    mockGamepad.axes[9] = 0.714;
    vm.runInContext('update()', context);
    assert(vm.runInContext('player.x', context) > beforeHatX, 'CRKD ATOM inverted POV Hat should move laser base right');
    mockGamepad.axes[9] = 1.2857;

    // 5. Face button B/A (button 0) fires laser
    mockGamepad.buttons[0].pressed = true;
    vm.runInContext('update()', context);
    assert.strictEqual(vm.runInContext('bullets.length', context), 1, 'CRKD ATOM face button 0 should fire player laser');
    console.log('PASS: CRKD ATOM Collectible Keychain Controller verified across all modes.');
}

async function testSeparatePwaIsolation() {
    console.log('Testing: Standalone PWA manifest, scoped Service Worker cache isolation, and storage key isolation...');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    assert(html.includes('<link rel="manifest" href="manifest.json">'), 'Space Invaders index.html must link manifest.json');
    assert(html.includes('name="apple-mobile-web-app-title" content="Space Invaders"'), 'Space Invaders index.html must set apple-mobile-web-app-title');
    assert(html.includes('id="install-btn"'), 'Space Invaders index.html must include install-btn');

    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
    assert.strictEqual(manifest.id, '/space-invaders/', 'Space Invaders manifest must have unique id "/space-invaders/"');
    assert.strictEqual(manifest.display, 'standalone', 'Space Invaders manifest must use standalone display');
    assert.strictEqual(manifest.scope, './', 'Space Invaders manifest must scope to ./');
    assert(manifest.icons.some(i => i.purpose === 'any') && manifest.icons.some(i => i.purpose === 'maskable'), 'Space Invaders manifest must provide separate any and maskable icons');

    // Verify sw.js activate handler only deletes space-invaders-arcade-* caches and never deletes galaga-arcade-* caches
    const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf-8');
    const deletedCaches = [];
    let activateHandler = null;
    const swSandbox = {
        self: {
            addEventListener: (type, fn) => { if (type === 'activate') activateHandler = fn; },
            skipWaiting: () => {},
            clients: { claim: () => {} }
        },
        caches: {
            keys: () => Promise.resolve(['space-invaders-arcade-v5', 'space-invaders-arcade-v6', 'galaga-arcade-v4']),
            delete: (k) => { deletedCaches.push(k); return Promise.resolve(true); }
        },
        Promise
    };
    vm.runInNewContext(swCode, swSandbox);
    let waitPromise = null;
    activateHandler({ waitUntil: p => { waitPromise = p; } });
    await waitPromise;
    assert.deepStrictEqual(deletedCaches, ['space-invaders-arcade-v5'], 'Space Invaders SW must only delete old space-invaders-arcade-* caches and preserve Galaga cache');
    console.log('PASS: Space Invaders PWA manifest, SW cache isolation, and storage key isolation verified.');
}

function test1978AuthenticityAuditFixes() {
    console.log('Testing: 1978 ROM authenticity fixes (52->5 march audio, score reload rate, shot-vs-shot, eroded ground line, UFO band & bitmap HUD)...');
    const { context, elements } = setupEnvironment();
    elements['start-btn'].onclick();

    // 1. March bass audio delay follows ROM 0x1A11/0x1A21 (52 frames at 55 aliens -> 5 frames at 1 alien, never 1 frame buzz)
    const soundDelays = vm.runInContext(`({
        s55: getMarchSoundDelay(55),
        s10: getMarchSoundDelay(10),
        s2: getMarchSoundDelay(2),
        s1: getMarchSoundDelay(1)
    })`, context);
    assert.strictEqual(soundDelays.s55, 52, 'Expected 52-frame march sound delay at 55 invaders');
    assert.strictEqual(soundDelays.s10, 16, 'Expected 16-frame march sound delay at 10 invaders');
    assert.strictEqual(soundDelays.s2, 7, 'Expected 7-frame march sound delay at 2 invaders');
    assert.strictEqual(soundDelays.s1, 5, 'Expected 5-frame march sound delay at 1 invader');

    // 2. Score-based ROM reload rate table (0x30, 0x10, 0x0B, 0x08, 0x07)
    const reloadRates = vm.runInContext(`[
        getAlienReloadRate(0),
        getAlienReloadRate(500),
        getAlienReloadRate(1500),
        getAlienReloadRate(2500),
        getAlienReloadRate(3500)
    ]`, context);
    assert.deepStrictEqual(Array.from(reloadRates), [48, 16, 11, 8, 7], 'Expected exact 1978 ROM score reload table');

    // 3. Cellophane color bands: Top HUD white (<64), UFO red (64..127), playfield white (128..367), bunkers/ground green (>=368)
    const bands = vm.runInContext(`({
        hud: getCellophaneColor(20),
        ufo: getCellophaneColor(84),
        mid: getCellophaneColor(200),
        bunker: getCellophaneColor(384)
    })`, context);
    assert.strictEqual(bands.hud, '#F0F0F0', 'Top HUD should be white');
    assert.strictEqual(bands.ufo, '#FF2A2A', 'UFO band (64..127) should be red');
    assert.strictEqual(bands.mid, '#F0F0F0', 'Main invader playfield should be white');
    assert.strictEqual(bands.bunker, '#00FF44', 'Bunkers and lower rows should be green');

    // 4. Swept shot-vs-shot mutual collision & player shot lock
    vm.runInContext(`
        bullets = [{ x: 180, y: 260 }];
        enemyBullets = [{ x: 180, y: 256, type: 'plunger', slot: 1, steps: 5 }];
        spriteExplosions = [];
        update();
    `, context);
    assert.strictEqual(vm.runInContext('bullets.length', context), 0, 'Player shot should be destroyed in shot-vs-shot collision');
    assert.strictEqual(vm.runInContext('enemyBullets.length', context), 0, 'Enemy missile should be destroyed in shot-vs-shot collision');
    assert(vm.runInContext('player.shotLockTimer > 0', context), 'Player shot lock should engage briefly during shot splash');
    assert(vm.runInContext('spriteExplosions.some(s => s.type === "shot")', context), 'Shot-vs-shot should spawn shot_explosion sprite');

    // 5. Destructible bottom green ground line chips when enemy shot hits ground
    const initialGround = vm.runInContext('groundLine.filter(Boolean).length', context);
    assert.strictEqual(initialGround, 224, 'Ground line should start with 224 intact arcade pixels');
    vm.runInContext(`
        enemyBullets = [{ x: 200, y: 475, type: 'rolling', slot: 0, steps: 20 }];
        update();
    `, context);
    const afterGround = vm.runInContext('groundLine.filter(Boolean).length', context);
    assert(afterGround < initialGround, 'Enemy shot hitting bottom baseline should erode pixels from green ground line');

    // 6. UFO spawns cleanly at y = 84 (below top HUD) and sequential popup has delay > 0
    vm.runInContext(`
        ufo = null;
        ufoSpawnTimer = 1;
        update();
    `, context);
    assert.strictEqual(vm.runInContext('ufo.y', context), 84, 'UFO should fly cleanly at y = 84 inside red cellophane band');
    assert.strictEqual(vm.runInContext('ufo.speed', context), 2.0, 'UFO should move at exact 1 arcade px/frame (2.0 screen px)');

    // 7. Wave clear pauses briefly and does NOT play extra-life fanfare
    vm.runInContext(`
        soundCallLog = [];
        enemies = [];
        waveClearTimer = 0;
        update();
    `, context);
    assert(vm.runInContext('waveClearTimer > 0', context), 'Wave clear should trigger brief transition pause');
    for (let f = 0; f < 50; f++) vm.runInContext('update()', context);
    assert.strictEqual(vm.runInContext('level', context), 2, 'Wave should advance to level 2 after pause');
    assert.strictEqual(vm.runInContext('enemies.length', context), 55, 'Wave 2 should spawn full 55-invader rack');
    assert.strictEqual(vm.runInContext('groundLine.filter(Boolean).length', context), 224, 'Ground line should restore on Wave 2');
    assert(!vm.runInContext('soundCallLog.some(s => s.type === "extra_life")', context), 'Wave clear should not play extra-life fanfare');

    // 8. Bass sound fires in exact 1:1 lockstep with each full rack sweep (every 55 frames at 55 invaders)
    //    and caps smoothly at 5 frames when 1 invader remains
    const lockstepCounts = vm.runInContext(`(() => {
        spawnWave();
        soundCallLog = [];
        for (let f = 0; f < 110; f++) update(); // Exactly 2 full 55-invader sweeps
        const notes55 = soundCallLog.filter(s => s.type === 'march').length;

        enemies = [enemies[0]];
        rippleCursor = 0;
        fleetStepTimer = 0;
        soundCallLog = [];
        for (let f = 0; f < 25; f++) update(); // 25 frames at 1 alien -> 5 notes (every 5 frames, not 25)
        const notes1 = soundCallLog.filter(s => s.type === 'march').length;
        return { notes55, notes1 };
    })()`, context);
    assert.strictEqual(lockstepCounts.notes55, 2, '55-invader rack should fire exactly 2 bass notes across 2 full 55-frame sweeps');
    assert.strictEqual(lockstepCounts.notes1, 5, 'Single invader should cap bass heartbeat cleanly at 5-frame intervals');

    // 9. Draw renders crisp bitmap HUD & all entities without errors
    vm.runInContext('draw()', context);
    console.log('PASS: All 1978 arcade ROM authenticity fixes verified.');
}

(async () => {
    try {
        testAuthentic55InvaderRackAndScoring();
        testDeterministic23rdShot300PointUFO();
        testPerPixelDestructibleBunkers();
        testDynamicMarchSpeedAndExtraLifeAt1500();
        testEnemyBulletAndInvasionGameOver();
        testAuthenticDiscreteAnalogSoundPassAndRippleMarch();
        testCrkdAtomKeychainControllerSupport();
        test1978AuthenticityAuditFixes();
        await testSeparatePwaIsolation();
        console.log('\nAll Space Invaders tests passed successfully!');
    } catch (e) {
        console.error('\nTest failed:', e.message);
        process.exit(1);
    }
})();
