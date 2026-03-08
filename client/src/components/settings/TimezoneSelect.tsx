import React from 'react';

import { TimezoneAutocomplete } from 'components/common/TimezoneAutocomplete';

interface Props {
  value: string;
  onChange: (tz: string) => void;
}

export const TimezoneSelect: React.FC<Props> = ({ value, onChange }) => {
  return <TimezoneAutocomplete value={value} onChange={onChange} />;
};

export default TimezoneSelect;
