import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { captureMonomerGeometry } from '../src/utils/MonomerGeometry.js';
import { placeMonomer } from '../src/utils/MonomerPlacement.js';
import { buildPolymer } from '../src/utils/buildPolymer.js';
import { serializePolymer, flattenPolymer } from '../src/utils/pdb.js';
import { parsePdb } from '../src/utils/pdb.js';

function fixture() {
  const atoms = [
    {serial:10,index:3,elem:'H',x:-1,y:0,z:0,bonds:[7],bondOrder:[1]},
    {serial:20,index:7,elem:'C',atom:'CA',resn:'MON',resi:5,chain:'B',hetflag:true,x:0,y:0,z:0,bonds:[3,11],bondOrder:[1,2]},
    {serial:40,index:11,elem:'N',atom:'N1',resn:'MON',resi:5,chain:'B',hetflag:true,x:2,y:1,z:0,bonds:[7,15],bondOrder:[2,1]},
    {serial:60,index:15,elem:'H',x:3,y:2,z:1,bonds:[11],bondOrder:[1]},
  ];
  const sites = {head:{bondSerials:[10,20],retainedSerial:20},tail:{bondSerials:[40,60],retainedSerial:40}};
  const geometry = captureMonomerGeometry(atoms, sites);
  const template = {atoms:[{...atoms[1],bonds:[11],bondOrder:[2]},{...atoms[2],bonds:[7],bondOrder:[2]}],geometry};
  return {atoms,sites,template};
}

function close(actual, expected, tolerance=1e-9) { assert.ok(Math.abs(actual-expected)<tolerance, `${actual} != ${expected}`); }
function coordinates(value) { return Array.isArray(value)?value:[value.x,value.y,value.z]; }
function distance(a,b) { const p=coordinates(a); const q=coordinates(b); return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]); }
function assertJoining(anchor, unit, role, length) {
  close(distance(anchor.retainedPosition,unit.geometry[role].retainedPosition),length);
  for (const axis of [0,1,2]) {
    close(unit.geometry[role].direction[axis],-anchor.direction[axis]);
    close(unit.geometry[role].retainedPosition[axis],anchor.retainedPosition[axis]+length*anchor.direction[axis]);
  }
}

test('captures normalized retained-to-removed vectors with noncontiguous ids', function () {
  const {template} = fixture();
  assert.deepEqual(template.geometry.head,{retainedSerial:20,removedSerial:10,retainedPosition:[0,0,0],removedPosition:[-1,0,0],direction:[-1,0,0],bondLength:1});
  close(template.geometry.tail.bondLength,Math.sqrt(3));
  close(template.geometry.tail.direction[2],1/Math.sqrt(3));
});

test('placement aligns arbitrary directions, translates endpoints and transforms both sites without mutation', function () {
  const {template} = fixture();
  const before = structuredClone(template);
  const placed = placeMonomer(template,template.geometry.tail,'head',{bondLength:1.7,twist:47});
  assertJoining(template.geometry.tail,placed,'head',1.7);
  for (const role of ['head','tail']) {
    close(distance(placed.geometry[role].retainedPosition,placed.geometry[role].removedPosition),before.geometry[role].bondLength);
  }
  close(distance(placed.atoms[0],placed.atoms[1]),distance(template.atoms[0],template.atoms[1]));
  close(distance(placed.atoms[1],placed.geometry.tail.retainedPosition),0);
  assert.deepEqual(template,before);
  assert.notEqual(placed.atoms[0].bonds,template.atoms[0].bonds);
});

test('rotation about the removed endpoint preserves transverse twist around joining axis', function () {
  const {template} = fixture();
  const anchor = { ...template.geometry.tail,retainedPosition:[4,3,2],direction:[0,0,1]};
  const plain = placeMonomer(template,anchor,'head',{bondLength:2,twist:0});
  const twisted = placeMonomer(template,anchor,'head',{bondLength:2,twist:90});
  assertJoining(anchor,twisted,'head',2);
  close(distance(plain.geometry.head.removedPosition,twisted.geometry.head.removedPosition),0);
  close(distance(plain.atoms[1],twisted.atoms[1]),Math.sqrt(2));
});

test('head-tail uses previous tail and incoming head for every new unit', function () {
  const {template} = fixture();
  const result = buildPolymer('head-tail',template,{n:4,bondLength:1.4});
  assert.equal(result.units.length,4);
  assert.equal(result.connections.length,3);
  for (let i=1;i<4;i++) {
    assertJoining(result.units[i-1].geometry.tail,result.units[i],'head',1.4);
    assert.deepEqual(result.connections[i-1],{from:{unit:i-1,serial:40},to:{unit:i,serial:20},order:1});
  }
});

test('head-head alternates head/head and tail/tail', function () {
  const {template} = fixture();
  const result = buildPolymer('head-head',template,{n:4,bondLength:1.6});
  for (let i=1;i<4;i++) {
    const role=i%2===1?'head':'tail';
    const serial=role==='head'?20:40;
    assertJoining(result.units[i-1].geometry[role],result.units[i],role,1.6);
    assert.deepEqual(result.connections[i-1],{from:{unit:i-1,serial},to:{unit:i,serial},order:1});
  }
});

test('n=1 clones template and has no inter-unit connection', function () {
  const {template} = fixture();
  const result = buildPolymer('head-tail',template,{n:1,bondLength:1});
  assert.deepEqual(result.units,[template]);
  assert.notEqual(result.units[0],template);
  assert.deepEqual(result.connections,[]);
});

function callBuild(input) { return buildPolymer(input.type??'head-tail',input.template,input.options); }
test('rejects invalid counts, lengths, directions and missing endpoints', function () {
  const {template} = fixture();
  for (const options of [{n:0,bondLength:1},{n:1.5,bondLength:1},{n:Infinity,bondLength:1},{n:2,bondLength:0},{n:2,bondLength:NaN}]) {
    assert.throws(callBuild.bind(null,{template,options}));
  }
  assert.throws(callBuild.bind(null,{type:'unknown',template,options:{n:1,bondLength:1}}));
  const invalid=structuredClone(template);
  invalid.geometry.head.direction=[0,0,0];
  assert.throws(callBuild.bind(null,{template:invalid,options:{n:1,bondLength:1}}));
  invalid.geometry=template.geometry;
  invalid.atoms.pop();
  assert.throws(callBuild.bind(null,{template:invalid,options:{n:1,bondLength:1}}));
});

test('global atom indices, serials and all bond references are remapped without changing units', function () {
  const {template} = fixture();
  const result = buildPolymer('head-tail',template,{n:2,bondLength:1.5});
  const before=structuredClone(result);
  const atoms=flattenPolymer(result);
  assert.equal(atoms.length,4);
  assert.deepEqual(atoms[0].bonds,[1]);
  assert.deepEqual(atoms[0].bondOrder,[2]);
  assert.deepEqual(atoms[1].bonds,[0,2]);
  assert.deepEqual(atoms[2].bonds,[3,1]);
  for (let i=0;i<atoms.length;i++) { assert.equal(atoms[i].index,i); assert.equal(atoms[i].serial,i+1); }
  assert.deepEqual(result,before);
});

test('PDB roundtrip preserves metadata, coordinates, double bonds and inter-unit CONECT', function () {
  const {template} = fixture();
  const result = buildPolymer('head-tail',template,{n:2,bondLength:1.5});
  const pdb=serializePolymer(result);
  const parsed=parsePdb(pdb).atoms;
  assert.equal(parsed.length,4);
  assert.deepEqual(parsed[0],{recordName:'HETATM',serial:'1',name:'CA',altLoc:'',resName:'MON',chainID:'B',resSeq:'5',x:0,y:0,z:0,element:'C'});
  assert.ok(pdb.includes('CONECT    1    2    2'));
  assert.ok(pdb.includes('CONECT    2    1    1    3'));
  close(parsed[3].x,result.units[1].atoms[1].x,0.00051);
});

test('real 3Dmol parser preserves every internal and inter-unit bond without inferred bonds', function () {
  const require = createRequire(import.meta.url);
  const sandbox = {
    navigator: { userAgent: 'node' }, document: {},
    module: { exports: {} }, exports: {}, console, TextEncoder, TextDecoder,
  };
  sandbox.window = sandbox;
  runInNewContext(readFileSync(require.resolve('3dmol'), 'utf8'), sandbox);
  const { template } = fixture();
  for (const type of ['head-tail', 'head-head']) {
    const result = buildPolymer(type, template, { n: 4, bondLength: 1.5 });
    const expected = flattenPolymer(result);
    const parsed = sandbox.module.exports.Parsers.PDB(serializePolymer(result), {
      keepH: true, assignBonds: false,
    })[0];
    assert.equal(parsed.length, expected.length);
    for (let i = 0; i < parsed.length; i++) {
      assert.equal(parsed[i].serial, expected[i].serial);
      close(parsed[i].x, expected[i].x, 0.00051);
      close(parsed[i].y, expected[i].y, 0.00051);
      close(parsed[i].z, expected[i].z, 0.00051);
      assert.equal(parsed[i].bonds.length, expected[i].bonds.length);
      for (let j = 0; j < expected[i].bonds.length; j++) {
        const neighbor = parsed[i].bonds.indexOf(expected[i].bonds[j]);
        assert.notEqual(neighbor, -1);
        assert.equal(parsed[i].bondOrder[neighbor], expected[i].bondOrder[j]);
      }
    }
  }
});

test('rejects PDB atom and coordinate overflow before replacing a model', function () {
  const { template } = fixture();
  assert.throws(buildPolymer.bind(null, 'head-tail', template, { n: 50000, bondLength: 1.5 }), /99999/);
  const result = buildPolymer('head-tail', template, { n: 2, bondLength: 1e6 });
  assert.throws(serializePolymer.bind(null, result), /PDB/);
});

