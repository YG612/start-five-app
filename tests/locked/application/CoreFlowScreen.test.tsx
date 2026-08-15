import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {createCoreAppService} from '../../../src/application/coreAppService';
import {createTaskRepository} from '../../../src/data/taskRepository';
import {CoreFlowScreen} from '../../../src/screens/CoreFlowScreen';
import {MemoryKeyValueStorage} from '../fixtures/memoryStorage';

describe('SF-009 accessible local-only core page flow', () => {
  it('lets a user finish the essential flow without account or network access', async () => {
    const repository = createTaskRepository(new MemoryKeyValueStorage());
    const network = {request: jest.fn(() => Promise.reject(new Error('offline')))};
    const generatedIds = ['task-screen', 'step-screen'];
    const service = createCoreAppService({
      repository,
      now: () => '2026-01-02T03:04:05.000Z',
      idGenerator: () => generatedIds.shift() ?? 'unexpected-id',
      network,
    });
    const screen = await render(<CoreFlowScreen service={service} />);

    await fireEvent.press(screen.getByRole('button', {name: '新建任务'}));
    await fireEvent.changeText(screen.getByLabelText('任务名称'), '写周报');
    await fireEvent.press(screen.getByRole('checkbox', {name: '重要'}));
    await fireEvent.press(screen.getByRole('checkbox', {name: '紧急'}));
    await fireEvent.press(screen.getByRole('button', {name: '保存任务'}));
    await waitFor(() => expect(screen.getByText('任务：写周报')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', {name: '添加第一小步'}));
    await fireEvent.changeText(screen.getByLabelText('第一小步'), '打开文档');
    await fireEvent.press(screen.getByRole('button', {name: '保存小步'}));
    await waitFor(() => expect(screen.getByText('小步：打开文档')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', {name: '推荐下一项'}));
    await waitFor(() => expect(screen.getByText('推荐：写周报')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', {name: '开始5分钟'}));
    await waitFor(() => expect(screen.getByText('当前小步：打开文档')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', {name: '完成小步'}));
    await waitFor(() =>
      expect(screen.getByText('小步状态：已完成')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', {name: '完成任务'}));
    await waitFor(() => expect(screen.getByText('本次成长值：35')).toBeTruthy());

    expect((await service.getState()).totalScore).toBe(35);
    expect(await repository.list()).toHaveLength(1);
    expect(network.request).not.toHaveBeenCalled();
  });

  it('debounces a rapid double press on save so one task is created', async () => {
    const repository = createTaskRepository(new MemoryKeyValueStorage());
    const idGenerator = jest.fn(() => 'one-task');
    const service = createCoreAppService({
      repository,
      now: () => '2026-01-02T03:04:05.000Z',
      idGenerator,
    });
    const screen = await render(<CoreFlowScreen service={service} />);

    await fireEvent.press(screen.getByRole('button', {name: '新建任务'}));
    await fireEvent.changeText(screen.getByLabelText('任务名称'), '不要重复');
    const save = screen.getByRole('button', {name: '保存任务'});
    await fireEvent.press(save);
    await fireEvent.press(save);

    await waitFor(async () => expect(await repository.list()).toHaveLength(1));
    expect(idGenerator).toHaveBeenCalledTimes(1);
  });
});
