import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { DrawablyInput } from 'drawably/react';
import { useT } from '../i18n/useT';

type DrawablyInputProps = React.ComponentProps<typeof DrawablyInput>;

// El propio className de DrawablyInput cae en el <span> envoltorio de
// esbozo exterior, no en el <input> en sí, así que el botón del ojo se
// posiciona relativo a un div envoltorio en vez de depender del layout
// propio del wrapper.
export const PasswordField: React.FC<DrawablyInputProps> = ({ style, ...rest }) => {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <DrawablyInput
        {...rest}
        type={visible ? 'text' : 'password'}
        style={{ paddingRight: '2.5rem', ...style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
        className="password-toggle absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};
