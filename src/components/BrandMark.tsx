import React from 'react';
import {StyleSheet, View} from 'react-native';

export function BrandMark(props: Readonly<{size?: number}>): React.JSX.Element {
  const size = props.size ?? 36;
  const gap = Math.max(2, Math.round(size * 0.08));
  const tile = (size - gap) / 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.mark, {width: size, height: size, gap}]}>
      <View style={[styles.tile, styles.fire, {width: tile, height: tile}]} />
      <View style={[styles.tile, styles.growth, {width: tile, height: tile}]} />
      <View style={[styles.tile, styles.interrupt, {width: tile, height: tile}]} />
      <View style={[styles.tile, styles.clear, {width: tile, height: tile}]} />
      <View
        style={[
          styles.actionPoint,
          {
            width: Math.max(7, size * 0.24),
            height: Math.max(7, size * 0.24),
            borderRadius: size,
            right: -size * 0.03,
            top: -size * 0.03,
            borderWidth: Math.max(2, size * 0.06),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {flexDirection: 'row', flexWrap: 'wrap', position: 'relative'},
  tile: {borderRadius: 5},
  fire: {backgroundColor: '#D85B4A'},
  growth: {backgroundColor: '#2A8A77'},
  interrupt: {backgroundColor: '#D39A36'},
  clear: {backgroundColor: '#718B84'},
  actionPoint: {
    position: 'absolute',
    backgroundColor: '#F7C948',
    borderColor: '#FFFFFF',
  },
});
