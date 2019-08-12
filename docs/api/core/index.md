---
id: overview
title: Adapt Core API Overview
---

This overview is a short summary of the most often-used APIs from the Adapt Core library.
It's arranged into sections based on the type of task each API is typically associated with.

For the complete list of all APIs, start at the [top level exports](./core) for @adpt/core.

## Writing Adapt Specifications

### Built-in Components

- [Group](./core.adapt.group.md)
- [Sequence](./core.adapt.sequence.md)

### Stacks

- [stack(stackName, root, style)](./core.stack.md)

### Style Sheets

- [concatStyles(styles)](./core.concatstyles.md)
- [rule(override)](./core.rule.md)
- [ruleNoRematch(info, elem)](./core.rulenorematch.md)
- [Style](./core.style.md)


## Writing Your Own Components

### Class Components

- [Component](./core.component.md)
- [DeferredComponent](./core.deferredcomponent.md)
- [PrimitiveComponent](./core.primitivecomponent.md)

### Built-in Hooks

- [useAsync(f, initial)](./core.adapt.useasync.md)
- [useBuildHelpers()](./core.adapt.usebuildhelpers.md)
- [useContext(context)](./core.usecontext.md)
- [useDependsOn(f)](./core.adapt.usedependson.md)
- [useDeployedWhen(f)](./core.adapt.usedeployedwhen.md)
- [useImperativeMethods(create)](./core.adapt.useimperativemethods.md)
- [useMethod(hand, initial, method, args)](./core.adapt.usemethod.md)
- [useMethodFrom(hand, methodName, defaultVal, args)](./core.adapt.usemethodfrom.md)
- [useReadyFrom(targetHand)](./core.adapt.usereadyfrom.md)
- [useState(init)](./core.adapt.usestate.md)

### Utilities

- [callInstanceMethod(hand, def, methodName, args)](./core.adapt.callinstancemethod.md)
- [callNextInstanceMethod(hand, def, methodName, args)](./core.adapt.callnextinstancemethod.md)
- [childrenToArray(propsChildren)](./core.childrentoarray.md)
- [handle(name)](./core.handle.md)


## Advanced Adapt Topics

### Writing Deployment Plugins

- [WidgetPlugin](./core.adapt.widgetplugin.md)

### Writing Observers

- [gql](./core.gql.md)
- [Observer](./core.observer.md)
- [ObserverNeedsData](./core.observerneedsdata.md)

### Complete API Reference

- [@adpt/core](core)
