import unbs, { Style, } from "../../src";
import Container, { Props } from "../../ulib/Container";
import LocalContainer from "../../ulib/deploy/local/LocalContainer";

const localStyle =
    <Style>
        {Container} {unbs.rule<Props>((props) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
