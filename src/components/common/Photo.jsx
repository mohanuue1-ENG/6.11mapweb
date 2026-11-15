import React, { useState } from 'react';

// Shows /assets/photos/<name>.jpg when that file exists, and the children (an illustration)
// when it does not. To use a real photo, just drop the file into public/assets/photos/.
export default function Photo({ name, alt, className = '', children }) {
  const [failed, setFailed] = useState(false);
  if (failed) return children;
  return <img src={`/assets/photos/${name}.jpg`} alt={alt} className={className} onError={() => setFailed(true)} />;
}
