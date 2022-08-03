// Copyright (c) 2021 Terminus, Inc.
//
// This program is free software: you can use, redistribute, and/or modify
// it under the terms of the GNU Affero General Public License, version 3
// or later ("AGPL"), as published by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import React from 'react';
import { AutoComplete, Button, Form, Popover } from 'antd';
import { ErdaIcon, RenderPureForm, ErdaAlert } from 'common';
import projectStore from 'project/stores/project';
import { some } from 'lodash';
import { useMount } from 'react-use';
import { getJoinedApps } from 'user/services/user';
import { createFlow, getBranches, getBranchPolicy } from 'project/services/project-workflow';
import i18n from 'i18n';

interface IProps {
  enable?: boolean;
  flow: DEVOPS_WORKFLOW.BranchFlows;
  onAdd: () => void;
  metaData: {
    iteration: ITERATION.Detail;
    issue: Obj;
  };
}

// valid branch rule
// eg:  (feature/123, feature/*,hotfix/*) => true
const validateBranchRule = (v: string, rule: string) => {
  const rules = rule.split(',');
  return some(rules, (r) => {
    if (r.endsWith('/*')) {
      const rPrefix = r.split('/*')[0];
      return v !== `${rPrefix}/` && v.startsWith(`${rPrefix}/`);
    } else {
      return r === v;
    }
  });
};

const AddFlow: React.FC<IProps> = ({ onAdd, metaData = {}, flow }) => {
  const [form] = Form.useForm<Omit<DEVOPS_WORKFLOW.CreateFlowNode, 'issueID'>>();
  const allBranch = getBranches.useData();
  const { id: projectId, name: projectName } = projectStore.useStore((s) => s.info);
  const [visible, setVisible] = React.useState(false);
  const apps = getJoinedApps.useData();
  const metaWorkflow = getBranchPolicy.useData();
  const branchPolicies = metaWorkflow?.branchPolicies ?? [];

  const curPolicy = branchPolicies.find((item) => item.branch === flow.targetBranch);
  const { currentBranch: currentBranchRule, sourceBranch, targetBranch } = curPolicy?.policy || {};

  const { iteration, issue } = metaData;

  const allBranchRef = React.useRef<REPOSITORY.IBranch[] | null>(null);

  React.useImperativeHandle(allBranchRef, () => allBranch);

  const getBranchInfo = () => {
    if (curPolicy) {
      let _currentBranch = currentBranchRule?.replaceAll('*', issue.id);
      const currentBranchOption = _currentBranch ? _currentBranch.split(',') : [];
      return {
        values: {
          currentBranch: currentBranchOption[0],
        },
        currentBranchOption,
      };
    }
    return {};
  };

  useMount(() => {
    if (flow) {
      form.setFieldsValue({ flowRuleName: flow.name });
    }
  });

  React.useEffect(() => {
    if (projectId) {
      getJoinedApps.fetch({
        projectId,
        pageNo: 1,
        pageSize: 200,
      });
      getBranchPolicy.fetch({ projectID: `${projectId}` });
    }
  }, [projectId]);

  const content = React.useMemo(() => {
    const handleCancel = () => {
      setVisible(false);
      form.resetFields();
    };
    const handleOk = async () => {
      const formData = await form.validateFields();
      await createFlow.fetch({
        issueID: issue.id,
        ...formData,
        flowRuleName: flow.name,
      });
      handleCancel();
      onAdd();
    };

    const list = [
      {
        name: 'flowName',
        getComp: () => {
          return (
            <ErdaAlert
              message={i18n.t(
                'dop:Current workflow, pull from {sourceBranch} branch to create a new branch, merge into {targetBranch} branch',
                { sourceBranch, targetBranch: targetBranch?.mergeRequest },
              )}
              type="warning"
            />
          );
        },
      },

      {
        label: i18n.t('App'),
        type: 'select',
        name: 'appID',
        options: apps?.list
          .filter((item) => !item.isExternalRepo)
          .map((app) => ({ name: app.displayName, value: app.id })),
        itemProps: {
          showSearch: true,
          onChange: (v: number) => {
            const { name } = apps?.list?.find((item) => item.id === v)!;
            const result = getBranchInfo()?.values;
            form.setFieldsValue(result);
            getBranches
              .fetch({
                projectName,
                appName: name,
              })
              .then(() => {
                form.validateFields(['appID', 'currentBranch']);
              });
          },
        },
        rules: [
          {
            validator: (_: unknown, value: string) => {
              if (allBranchRef.current?.some((item) => item.name === sourceBranch)) {
                return Promise.resolve();
              }
              return Promise.reject(
                new Error(
                  i18n.t('dop:The branch {branch} does not exist, Please create the branch first', {
                    branch: sourceBranch,
                  }),
                ),
              );
            },
          },
        ],
      },

      {
        label: i18n.s('New branch', 'dop'),
        name: 'currentBranch',
        getComp: () => {
          const ops = getBranchInfo()?.currentBranchOption;
          return <AutoComplete options={ops?.map((item) => ({ value: item }))} />;
        },
        rules: [
          {
            validator: (_rule: any, value: string) => {
              if (value) {
                const reg = /^[a-zA-Z_]+[\\/\\.\\$@#a-zA-Z0-9_-]*$/;

                if (!reg.test(value)) {
                  return Promise.reject(
                    new Error(i18n.t('start with letters and can contain characters that are not wildcard')),
                  );
                } else if (currentBranchRule && !validateBranchRule(value, currentBranchRule)) {
                  return Promise.reject(
                    new Error(`${i18n.s('Please fill in the correct branch rule', 'dop')}, ${currentBranchRule}`),
                  );
                }
              }

              return Promise.resolve();
            },
          },
        ],
      },
    ];
    return (
      <div className="w-[400px]">
        <RenderPureForm form={form} list={list} />
        <div className="flex justify-end">
          <Button className="mr-4" onClick={handleCancel}>
            {i18n.t('Cancel')}
          </Button>
          <Button type="primary" onClick={handleOk}>
            {i18n.t('OK')}
          </Button>
        </div>
      </div>
    );
  }, [form, apps, iteration]);
  return (
    <Popover
      title={`${i18n.s('Create workflow', 'dop')}: ${flow?.name}`}
      trigger={['click']}
      content={content}
      visible={visible}
      onVisibleChange={setVisible}
    >
      <div
        className="h-7 mr-2 p-1 rounded-sm text-sub hover:text-default hover:bg-default-04 cursor-pointer"
        onClick={() => {
          setVisible(true);
        }}
      >
        <ErdaIcon type="plus" size={20} />
      </div>
    </Popover>
  );
};

const AddFlowContainer = (props: IProps) => {
  const { enable } = props;
  if (!enable) {
    return <ErdaIcon type="plus" size={20} className="cursor-not-allowed text-default-4" />;
  }
  return <AddFlow {...props} />;
};

export default AddFlowContainer;
