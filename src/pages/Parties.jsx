import { useMemo, useState } from 'react'
import { Eye, Pencil, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { useApp } from '../context.jsx'
import { ConfirmDialog, EmptyState, Modal, PageHeader, StatCard, StatusBadge } from '../components/ui.jsx'
import PartyForm from '../forms/PartyForm.jsx'
import PaymentForm from '../forms/PaymentForm.jsx'
import { formatDate, formatKg, formatMoney, sum } from '../lib/format.js'

const TEXT = {
  supplier: {
    title: 'Suppliers', eyebrow: 'People you buy from', sub: 'Who you buy from, what you have paid them, and what you still owe.',
    add: 'Add supplier', owed: 'You owe suppliers', pay: 'Pay', paid: 'Paid', txnWord: 'Purchases',
  },
  buyer: {
    title: 'Buyers', eyebrow: 'People you sell to', sub: 'Who you sell to, what they have paid, and what they still owe you.',
    add: 'Add buyer', owed: 'Buyers owe you', pay: 'Receive', paid: 'Received', txnWord: 'Sales',
  },
}

export default function Parties({ kind }) {
  const { data, derived, actions, notify } = useApp()
  const T = TEXT[kind]
  const statements = kind === 'supplier' ? derived.suppliers : derived.buyers
  const parties = kind === 'supplier' ? data.suppliers : data.buyers
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return parties
      .map((p) => statements[p.id])
      .filter((st) => st && (!s || `${st.party.name} ${st.party.phone} ${st.party.location}`.toLowerCase().includes(s)))
      .sort((a, b) => b.outstanding - a.outstanding || a.party.name.localeCompare(b.party.name))
  }, [parties, statements, q])

  const totalOwed = sum(Object.values(statements), (s) => Math.max(s.outstanding, 0))
  const owingCount = Object.values(statements).filter((s) => s.outstanding > 0.005).length

  const remove = () => {
    const res = actions.deleteParty(kind, modal.del.id)
    notify(res.ok ? `${modal.del.name} removed.` : res.error, res.ok ? 'success' : 'error')
    setModal(null)
  }

  return (
    <>
      <PageHeader eyebrow={T.eyebrow} title={T.title} subtitle={T.sub}>
        <button className="primary-button" onClick={() => setModal({ edit: null, form: true })}><Plus size={18} /> {T.add}</button>
      </PageHeader>

      <section className="stats-grid three">
        <StatCard tone="green" icon={Users} label={`Total ${T.title.toLowerCase()}`} value={String(parties.length)} note={`${owingCount} with a balance`} />
        <StatCard tone={kind === 'supplier' ? 'orange' : 'blue'} icon={Wallet} label={T.owed} value={formatMoney(totalOwed)} />
        <StatCard tone="yellow" icon={Users} label={`${T.txnWord} total`} value={formatMoney(sum(Object.values(statements), (s) => s.totalValue))} note={formatKg(sum(Object.values(statements), (s) => s.totalKg))} />
      </section>

      <div className="panel">
        <div className="filters">
          <input type="search" placeholder={`Search ${T.title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Name</th><th className="num">{T.txnWord}</th><th className="num">Weight</th><th className="num">Total</th><th className="num">{T.paid}</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((st) => (
                  <tr key={st.party.id}>
                    <td className="strong">{st.party.name}<small className="sub">{[st.party.location, st.party.phone].filter(Boolean).join(' · ')}</small></td>
                    <td className="num">{st.count}</td>
                    <td className="num">{formatKg(st.totalKg)}</td>
                    <td className="num">{formatMoney(st.totalValue)}</td>
                    <td className="num">{formatMoney(st.paid)}</td>
                    <td className={`num strong ${st.outstanding > 0.005 ? 'neg' : ''}`}>{formatMoney(st.outstanding)}</td>
                    <td><StatusBadge status={st.status} /></td>
                    <td className="row-actions wide">
                      {st.outstanding > 0.005 ? <button className="ghost-button small" onClick={() => setModal({ pay: st })}>{T.pay}</button> : null}
                      <button className="icon-button" aria-label="View history" onClick={() => setModal({ view: st.party.id })}><Eye size={16} /></button>
                      <button className="icon-button" aria-label="Edit" onClick={() => setModal({ form: true, edit: st.party })}><Pencil size={16} /></button>
                      <button className="icon-button" aria-label="Delete" onClick={() => setModal({ del: st.party })}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title={parties.length ? 'No matches' : `No ${T.title.toLowerCase()} yet`} text={parties.length ? 'Try a different search.' : `Add ${kind === 'supplier' ? 'the people you buy from' : 'the companies you sell to'}, or add them while recording a ${kind === 'supplier' ? 'purchase' : 'sale'}.`} />
        )}
      </div>

      {modal?.form ? <PartyForm kind={kind} initial={modal.edit} onClose={() => setModal(null)} /> : null}
      {modal?.pay ? <PaymentForm kind={kind} party={modal.pay.party} outstanding={modal.pay.outstanding} onClose={() => setModal(null)} /> : null}
      {modal?.view ? <Statement kind={kind} st={statements[modal.view]} onPay={(st) => setModal({ pay: st })} onClose={() => setModal(null)} /> : null}
      {modal?.del ? <ConfirmDialog title={`Delete ${modal.del.name}?`} message="They will be removed from your list. This is only possible if they have no records." onConfirm={remove} onCancel={() => setModal(null)} /> : null}
    </>
  )
}

function Statement({ kind, st, onPay, onClose }) {
  const { actions, notify } = useApp()
  const [del, setDel] = useState(null)
  if (!st) return null
  const T = TEXT[kind]

  const removePayment = () => {
    const res = actions.deletePayment(del.id)
    notify(res.ok ? 'Payment deleted.' : res.error, res.ok ? 'success' : 'error')
    setDel(null)
  }

  return (
    <Modal title={st.party.name} subtitle={[st.party.location, st.party.phone].filter(Boolean).join(' · ') || 'Account history'} onClose={onClose} wide>
      <div className="mini-stats">
        <div><span>{T.txnWord} total</span><b>{formatMoney(st.totalValue)}</b></div>
        <div><span>{T.paid}</span><b>{formatMoney(st.paid)}</b></div>
        <div><span>Balance</span><b className={st.outstanding > 0.005 ? 'neg' : ''}>{formatMoney(st.outstanding)}</b></div>
        {st.outstanding > 0.005 ? <button className="primary-button" onClick={() => onPay(st)}>{kind === 'supplier' ? 'Pay supplier' : 'Receive payment'}</button> : null}
      </div>

      <h5>{T.txnWord}</h5>
      {st.txns.length ? (
        <div className="table-wrap">
          <table className="data compact">
            <thead><tr><th>Date</th><th>Type</th><th className="num">Weight</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {[...st.txns].reverse().map((t) => (
                <tr key={t.id}><td className="nowrap">{formatDate(t.date)}</td><td>{t.type}</td><td className="num">{formatKg(t.kg)}</td><td className="num">{formatMoney(t.total)}</td><td className="num">{formatMoney(t.balance)}</td><td><StatusBadge status={t.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No records yet.</p>}

      <h5>Payments made later</h5>
      {st.payments.length ? (
        <div className="table-wrap">
          <table className="data compact">
            <thead><tr><th>Date</th><th className="num">Amount</th><th>Note</th><th /></tr></thead>
            <tbody>
              {[...st.payments].reverse().map((p) => (
                <tr key={p.id}><td className="nowrap">{formatDate(p.date)}</td><td className="num">{formatMoney(p.amount)}</td><td>{p.note}</td>
                  <td className="row-actions"><button className="icon-button" aria-label="Delete payment" onClick={() => setDel(p)}><Trash2 size={16} /></button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">None. Money paid at the time of a deal is shown in the table above.</p>}

      {del ? <ConfirmDialog title="Delete this payment?" message={`${formatMoney(del.amount)} on ${formatDate(del.date)} will be removed and the balance goes back up.`} onConfirm={removePayment} onCancel={() => setDel(null)} /> : null}
    </Modal>
  )
}
