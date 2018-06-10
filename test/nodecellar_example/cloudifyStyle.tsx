import unbs, { Style, } from "../../src";

import LocalCompute, { LocalComputeProps } from "../../ulib/cloud/local/LocalCompute";
import LocalContainer, { LocalContainerProps } from "../../ulib/cloud/local/LocalContainer";

import CloudifyCompute from "../../ulib/deploy/cloudify/CloudifyCompute";
import CloudifyContainer from "../../ulib/deploy/cloudify/CloudifyContainer";

const cloudifyStyle =
    <Style>
        {LocalCompute} {unbs.rule<LocalComputeProps>((props) => (
            <CloudifyCompute
                install_agent="false"
                cloudify_agent={{}}
                {...props} />
        ))}

        {LocalContainer} {unbs.rule<LocalContainerProps>((props) => (
            <CloudifyContainer {...props} />
        ))}
    </Style>;
export default cloudifyStyle;
