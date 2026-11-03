import { fromWGS84, toWGS84 } from '../src/core/coords';
import { getList, getNumber, getString, getStringList } from '../src/core/jsonpath';
import { parseCsv } from '../src/sources/csv';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
	if (ok) {
		console.log(`  ok   ${name}`);
	} else {
		failures++;
		console.log(`  FAIL ${name} ${detail}`);
	}
}

console.log('coords');
{
	const [glat, glng] = fromWGS84(39.9042, 116.4074, 'GCJ02');
	const [wlat, wlng] = toWGS84(glat, glng, 'GCJ02');
	check('roundtrip lat error < 1e-5', Math.abs(wlat - 39.9042) < 1e-5, `${wlat}`);
	check('roundtrip lng error < 1e-5', Math.abs(wlng - 116.4074) < 1e-5, `${wlng}`);
	check('china offset is non-zero', Math.abs(glat - 39.9042) > 0.0005, `${glat}`);
	const [bLat, bLng] = fromWGS84(39.9042, 116.4074, 'BD09');
	const [gLat2, gLng2] = toWGS84(bLat, bLng, 'BD09');
	check('bd09 roundtrip', Math.abs(gLat2 - 39.9042) < 1e-4 && Math.abs(gLng2 - 116.4074) < 1e-4);
	// Regression: a note storing GCJ-02 must land on the WGS-84 basemap at the
	// converted position, not at the raw value (was an inline-map offset bug).
	const noteRaw: [number, number] = [40.049613, 116.280701];
	const noteWgs = toWGS84(noteRaw[0], noteRaw[1], 'GCJ02');
	check('note GCJ02 -> WGS84 differs', Math.abs(noteWgs[0] - noteRaw[0]) > 0.0005);
	check('note WGS84 round-trips', Math.abs(fromWGS84(noteWgs[0], noteWgs[1], 'GCJ02')[1] - noteRaw[1]) < 1e-6);
	const [oLat, oLng] = toWGS84(48.8584, 2.2945, 'GCJ02');
	check('outside china untouched', oLat === 48.8584 && oLng === 2.2945);
}

console.log('jsonpath');
{
	const payload = {
		data: {
			items: [
				{ id: 'a', title: 'A', location: { lat: 39.9, lng: 116.4 }, tags: ['x', 'y'] },
				{ id: 'b', title: 'B', location: { lat: 31.2, lng: 121.5 }, tags: [] },
			],
		},
	};
	const items = getList(payload, '$.data.items');
	check('list length', items.length === 2, String(items.length));
	check('nested number', getNumber(payload, '$.data.items[0].location.lat') === 39.9);
	check('string', getString(payload, '$.data.items[1].title') === 'B');
	check('wildcard list', getStringList(payload, '$.data.items[*].tags').join(',') === 'x,y');
	check('missing path', getString(payload, '$.nope.nope') === undefined);
	check('array root', getList([{ id: 1 }], '$').length === 1);
}

console.log('csv');
{
	const text = '\uFEFFname,lat,lng,date\r\n"Haidilao, Beijing",39.9,116.4,2025-01-02\r\nCafe,31.2,121.5,\r\n';
	const rows = parseCsv(text);
	check('rows parsed', rows.length === 3, String(rows.length));
	check('quoted comma kept', rows[1][0] === 'Haidilao, Beijing', rows[1][0]);
	check('crlf handled', rows[2][2] === '121.5');
	check('bom stripped', rows[0][0] === 'name', rows[0][0]);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
