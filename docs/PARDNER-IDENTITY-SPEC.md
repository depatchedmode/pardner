# Pardner identity specification: did:key and key validity

This specification defines Pardner's implemented identity format. An
implementation in any language must reproduce the vectors in section 7.

## Why

- **A path to outside identities.** A person will later be able to link an identity they hold elsewhere (#257). Naming Pardner's own identities by DID is the first step.
- **The form freeq uses.** freeq names agents by `did:key` in exactly the form below, so a Pardner machine can appear there under the same identifier.
- **One identifier carries the key.** Records no longer need a separate public key field.

**What does not change**

- Records stay plain Ed25519-signed JSON. There are no DID documents, no resolution and no network lookups.
- Only machines hold keys. A person is still the set of machines they have linked, and agents have no keys.
- Membership stays a pure function of the signed records.

## 1. Machine DID

A machine's ID is the `did:key` of its machine key.

```
bytes = 0xed 0x01 ‖ the 32-byte raw Ed25519 public key
text  = "did:key:z" ‖ base58btc(bytes)        (the Bitcoin alphabet)
```

- It is always 56 characters and always starts `did:key:z6Mk`.
- It replaces `machine-…` everywhere: records, the handshake, the hub checkpoint, status, the CLI and the board.
- **Pardner accepts only this form.** That is a Pardner profile of did:key; the did:key specification also describes other encodings and key types.

## 2. Parsing

One parser serves every place an ID enters. A string is a machine DID only if all of these hold:

1. It is exactly 56 characters and starts `did:key:z`.
2. Every character after the `z` is in the base58btc alphabet.
3. It decodes to exactly 34 bytes, the first two being `0xed 0x01`.
4. Encoding those 34 bytes again gives the same string. So each key has one text form.
5. The remaining 32 bytes pass key validity (section 3).

The parser returns the key or refuses. It never repairs its input: no trimming, no case folding, no fragment or query removed. Two IDs are the same only when their strings are equal byte for byte.

## 3. Key validity

The shared Ed25519 check serves both `rawPublicKey()` and the DID parser.

A 32-byte Ed25519 public key is refused when either of these holds. Clear the top bit of the last byte, and read the 32 bytes as a little-endian integer `y`; `p` is 2^255 − 19.

- **Not canonical:** `y ≥ p`.
- **Small order:** `y` is 0, 1, `p − 1`, or one of the two order-eight values below. Both signs are refused, which also covers the encodings with `x = 0` and the sign bit set.

```
26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05
c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a
```

- **Why.** Against a small-order key, a signature anyone can write verifies. Node 24.11.1, which the acceptance contract pins, accepts those keys; Node 24.22.1 refuses them. The rule therefore does not rely on the runtime.
- **Where.** Wherever a key enters: records, join requests, the handshake and the registry. All of them use the shared key validity check.
- **Not covered.** Mixed-order keys. They do not allow a forgery without the private key.

## 4. Person DID

- A person's ID is a DID. For now it is the `did:key` of the machine they were admitted with, replacing `person-…`.
- It is the same string as that machine's DID. Records keep person and machine in separate fields, as they already do, and commands and screens always name the kind.
- **The rule.** In a `project.genesis` or `member.add`, the person's DID equals the DID of the machine the record certifies. A `machine.add` names an existing person.
- A person's first ID is permanent in the records.
- The limit tracked in #218 is unchanged: a computer paired into someone's identity cannot start a project or join another as a new person.

**What follows for a person**

| Event | Outcome |
|---|---|
| A second machine | It joins the person by `machine.add`. The person's DID does not change |
| The first machine is removed or lost | The person keeps their DID and membership through their other machines. Outside Pardner that DID is still controlled by the old key: a did:key cannot be revoked or updated. Pardner's removal covers Pardner only |
| The only machine is lost | Re-admission through a Human invitation gives the person a new DID and new Actor IDs. An authorized Device invitation can pair a replacement into a person who still belongs to the project |
| A person is removed and later re-admitted | A removal is permanent for that DID. They return as a new person |

## 5. Records and derived IDs

- **Record version 3 and join request version 3.** `signer`, `machineId` and `personId` hold DIDs.
- **The `publicKey` field goes** from certifications and join requests, because the DID carries the key. Code that needs the key decodes it from the DID.
- **Signing labels are unchanged.** The version is inside the signed bytes.
- **The project ID** stays the SHA-256 of the genesis record.
- **Actor IDs** for people and agents keep their derivation from the person's ID. Their values change with it.
- **Automerge actor IDs** keep their prefix: the first 16 bytes of the SHA-256 of the raw public key.
- **Short form.** Where a short machine ID is shown, it is the last six characters of the DID. Every Ed25519 `did:key` starts with the same `z6Mk`, so the start tells machines apart poorly.

## 6. Compatibility

- **Storage-breaking.** Membership records and join requests use version 3, client registries use version 5, and boards use schema 12.
- **Prior installs are refused and preserved.** A client directory made before the change is refused with the existing message. Its registry and data are left unchanged; the refusal can add an empty lock file. Nothing is migrated or deleted.
- People start a fresh client directory and new projects.

## 7. Test vectors

**Accepted**

| | Vector 1 | Vector 2 |
|---|---|---|
| Source | The public key of RFC 8032, test 1 | Published with the did:key specification |
| Raw key, hex | `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a` | `3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29` |
| Machine DID | `did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw` | `did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp` |
| Short form | `7oMMsw` | `mDooWp` |
| Automerge actor prefix, hex | `21fe31dfa154a261626bf854046fd227` | `139e3940e64b5491722088d9a0d74162` |

The [freeq device-key vector](https://github.com/freeq-irc/freeq/blob/36fca961d38fd07a7c43eb8bcf505cd43d596a20/spec/identity-record-vectors.json) with a seed of 32 bytes of `0x01` yields `did:key:z6Mkon3Necd6NkkyfoGoHxid2znGc59LU3K7mubaRcFbLfLX`.

**Refused keys** (32 bytes, hex)

```
0100000000000000000000000000000000000000000000000000000000000000   small order 1 (the identity)
ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f   small order 2
0000000000000000000000000000000000000000000000000000000000000000   small order 4
0000000000000000000000000000000000000000000000000000000000000080   small order 4
26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05   small order 8
26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85   small order 8
c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a   small order 8
c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa   small order 8
edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f   not canonical (y = p)
eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f   not canonical (y = p + 1)
0100000000000000000000000000000000000000000000000000000000000080   x = 0 with the sign bit set
```

**Refused DIDs**

| Input | Why |
|---|---|
| `did:key:z6MkeXATEjyXENzBXBxgC5EHk2JE5aqd7qMGGtDpLUH1e2Sj` | Well formed, but its key is the identity point |
| `did:key:z6Mkh59EgPEuBMugWwYWVMbZFQmHm8V1tcgLejJJTx6d8KB2` | Well formed, but its key has order eight |
| `did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMs` | 55 characters |
| `did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw#z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw` | A fragment |
| `DID:KEY:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw` | The scheme is not lower case |
| `did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMs0` | `0` is not in the base58btc alphabet |
| Vector 1 with a space before or after it | Not trimmed |
| A `did:key` that starts `zQ3s` or `z6LS` | Another key type (secp256k1, X25519) |
| `machine-eh7ddx5bksrgcytl7bkai36se4` | The earlier ID form |

## 8. Tests an implementation needs

- Both vectors encode and decode as shown, and every input in the two refused lists is refused.
- A person DID that is not the certified machine's DID is refused in a `project.genesis` and in a `member.add`.
- Each refused key is refused in a join request, a record and a handshake hello, and a forged signature against it is never accepted.
- Many freshly generated keys all pass, so the check never refuses one of Pardner's own.
- A client directory from before the change, with and without a lock file, is refused, and its registry and data are unchanged.
- The four outcomes in section 4.

## Related

- [Trust design](PARDNER-TRUST-DESIGN.md): what the records mean and how membership is computed.
- #257: linking an outside identity. freeq accepts a `did:key` for an agent but not as the owner of one, so a person owns agents there only through a linked outside identity.
- #215: the sync channel, which carries these IDs in its handshake.
