import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { CaretDown as CaretDownBase } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretUp as CaretUpBase } from '@phosphor-icons/react/dist/csr/CaretUp';
import { CheckCircle as CheckCircleBase } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { CircleHalf as CircleHalfBase } from '@phosphor-icons/react/dist/csr/CircleHalf';
import { Copy as CopyBase } from '@phosphor-icons/react/dist/csr/Copy';
import { FileArrowDown as FileArrowDownBase } from '@phosphor-icons/react/dist/csr/FileArrowDown';
import { FileHtml as FileHtmlBase } from '@phosphor-icons/react/dist/csr/FileHtml';
import { FilePdf as FilePdfBase } from '@phosphor-icons/react/dist/csr/FilePdf';
import { FilePlus as FilePlusBase } from '@phosphor-icons/react/dist/csr/FilePlus';
import { FolderOpen as FolderOpenBase } from '@phosphor-icons/react/dist/csr/FolderOpen';
import { FrameCorners as FrameCornersBase } from '@phosphor-icons/react/dist/csr/FrameCorners';
import { Info as InfoBase } from '@phosphor-icons/react/dist/csr/Info';
import { LockSimple as LockSimpleBase } from '@phosphor-icons/react/dist/csr/LockSimple';
import { Moon as MoonBase } from '@phosphor-icons/react/dist/csr/Moon';
import { SidebarSimple as SidebarSimpleBase } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { SlidersHorizontal as SlidersHorizontalBase } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { Sun as SunBase } from '@phosphor-icons/react/dist/csr/Sun';
import { TextAlignCenter as TextAlignCenterBase } from '@phosphor-icons/react/dist/csr/TextAlignCenter';
import { WarningCircle as WarningCircleBase } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { X as XBase } from '@phosphor-icons/react/dist/csr/X';

/**
 * The interface icon set: Phosphor, duotone weight throughout (Broadsheet's rule).
 *
 * Imported one module per icon so the bundle carries only these, and wrapped so no call site
 * has to remember the weight or to hide the glyph from assistive technology — every icon here
 * sits beside a text label or inside a control that carries its own accessible name.
 */
function duotone(Base: ComponentType<IconProps>) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return <Base weight="duotone" size={size} aria-hidden="true" focusable="false" {...rest} />;
  }
  return Icon;
}

export const CaretDown = duotone(CaretDownBase);
export const CaretUp = duotone(CaretUpBase);
export const CheckCircle = duotone(CheckCircleBase);
export const CircleHalf = duotone(CircleHalfBase);
export const Copy = duotone(CopyBase);
export const FileArrowDown = duotone(FileArrowDownBase);
export const FileHtml = duotone(FileHtmlBase);
export const FilePdf = duotone(FilePdfBase);
export const FilePlus = duotone(FilePlusBase);
export const FolderOpen = duotone(FolderOpenBase);
export const FrameCorners = duotone(FrameCornersBase);
export const Info = duotone(InfoBase);
export const LockSimple = duotone(LockSimpleBase);
export const Moon = duotone(MoonBase);
export const SidebarSimple = duotone(SidebarSimpleBase);
export const SlidersHorizontal = duotone(SlidersHorizontalBase);
export const Sun = duotone(SunBase);
export const TextAlignCenter = duotone(TextAlignCenterBase);
export const WarningCircle = duotone(WarningCircleBase);
export const X = duotone(XBase);
