import React from 'react';

// A label that turns into another when the pointer is over the button: "Add truck" becomes "Register a truck".
// The parent button needs the class "group". Both labels share one cell, so the button never changes size.
export default function HoverLabel({ label, hover }) {
  return (
    <span className="hl">
      <span className="hl-a">{label}</span>
      <span className="hl-b" aria-hidden="true">{hover}</span>
    </span>
  );
}
