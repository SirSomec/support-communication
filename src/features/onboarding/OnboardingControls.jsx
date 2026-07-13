import { CheckCircle2, Circle } from "lucide-react";

export function StepButton({ active, complete, hint = "", icon: Icon, label, onClick }) {
  return (
    <button className={`${active ? "active" : ""} ${complete ? "complete" : ""}`} onClick={onClick} type="button">
      <Icon size={18} />
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {complete ? <CheckCircle2 size={17} /> : <Circle size={17} />}
    </button>
  );
}

export function StepHeading({ icon, text, title }) {
  return (
    <header className="onboarding-step-heading">
      <div>{icon}</div>
      <span>Шаг onboarding</span>
      <h2 id="onboarding-step-title">{title}</h2>
      <p>{text}</p>
    </header>
  );
}

export function RangeControl({ label, max, min, onChange, value }) {
  return (
    <label className="onboarding-range">
      <span>{label}</span>
      <strong>{value}</strong>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

export function SummaryRow({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
