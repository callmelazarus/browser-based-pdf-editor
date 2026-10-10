import { createHash } from 'node:crypto'

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
])

function md5(...parts: Uint8Array[]): Uint8Array {
  const h = createHash('md5')
  for (const p of parts) h.update(p)
  return new Uint8Array(h.digest())
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i)
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  const out = new Uint8Array(data.length)
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255
    j = (j + s[i]) & 255
    ;[s[i], s[j]] = [s[j], s[i]]
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255]
  }
  return out
}

function padPassword(pw: string): Uint8Array {
  const b = new TextEncoder().encode(pw).slice(0, 32)
  const out = new Uint8Array(32)
  out.set(b)
  out.set(PAD.subarray(0, 32 - b.length), b.length)
  return out
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/**
 * A one-page PDF using the standard security handler (RC4 40-bit, V1/R2) with a non-empty
 * user password, so opening it without the password must fail. The page has no strings or
 * streams, so nothing besides the /Encrypt dictionary needs encrypting.
 */
export function makeEncryptedPdf(userPassword = 'secret', ownerPassword = 'owner'): Uint8Array {
  const P = -4
  const id = new Uint8Array(16).fill(7)
  const oKey = md5(padPassword(ownerPassword)).subarray(0, 5)
  const O = rc4(oKey, padPassword(userPassword))
  const pBytes = new Uint8Array(new Int32Array([P]).buffer)
  const key = md5(padPassword(userPassword), O, pBytes, id).subarray(0, 5)
  const U = rc4(key, PAD)

  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${hex(O)}> /U <${hex(U)}> /P ${P} >>`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [<${hex(id)}> <${hex(id)}>] >>\n`
  out += `startxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
