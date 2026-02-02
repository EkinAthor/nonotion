import type { PropertyDefinition, PropertyValue } from '@nonotion/shared';
import TitleCell from './TitleCell';
import TextCell from './TextCell';
import CheckboxCell from './CheckboxCell';
import SelectCell from './SelectCell';
import MultiSelectCell from './MultiSelectCell';
import DateCell from './DateCell';
import UrlCell from './UrlCell';
import PersonCell from './PersonCell';

interface CellRendererProps {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  onChange: (value: PropertyValue) => void;
  canEdit: boolean;
  rowId: string;
}

export default function CellRenderer({
  property,
  value,
  onChange,
  canEdit,
  rowId,
}: CellRendererProps) {
  const commonProps = { canEdit, rowId };

  switch (property.type) {
    case 'title':
      return (
        <TitleCell
          value={(value as { type: 'title'; value: string })?.value ?? ''}
          onChange={(v) => onChange({ type: 'title', value: v })}
          {...commonProps}
        />
      );

    case 'text':
      return (
        <TextCell
          value={(value as { type: 'text'; value: string })?.value ?? ''}
          onChange={(v) => onChange({ type: 'text', value: v })}
          {...commonProps}
        />
      );

    case 'checkbox':
      return (
        <CheckboxCell
          value={(value as { type: 'checkbox'; value: boolean })?.value ?? false}
          onChange={(v) => onChange({ type: 'checkbox', value: v })}
          {...commonProps}
        />
      );

    case 'select':
      return (
        <SelectCell
          value={(value as { type: 'select'; value: string | null })?.value ?? null}
          onChange={(v) => onChange({ type: 'select', value: v })}
          options={property.options ?? []}
          propertyId={property.id}
          {...commonProps}
        />
      );

    case 'multi_select':
      return (
        <MultiSelectCell
          value={(value as { type: 'multi_select'; value: string[] })?.value ?? []}
          onChange={(v) => onChange({ type: 'multi_select', value: v })}
          options={property.options ?? []}
          propertyId={property.id}
          {...commonProps}
        />
      );

    case 'date':
      return (
        <DateCell
          value={(value as { type: 'date'; value: string | null })?.value ?? null}
          onChange={(v) => onChange({ type: 'date', value: v })}
          {...commonProps}
        />
      );

    case 'url':
      return (
        <UrlCell
          value={(value as { type: 'url'; value: string })?.value ?? ''}
          onChange={(v) => onChange({ type: 'url', value: v })}
          {...commonProps}
        />
      );

    case 'person':
      return (
        <PersonCell
          value={(value as { type: 'person'; value: string | null })?.value ?? null}
          onChange={(v) => onChange({ type: 'person', value: v })}
          {...commonProps}
        />
      );

    default:
      return <span className="text-notion-text-secondary">Unsupported type</span>;
  }
}
